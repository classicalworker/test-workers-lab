// ===== MR(マスターレート)/ ACT試合数 自動更新スクリプト =====
// GitHub Actions(.github/workflows/update-mr.yml)から毎日1回(JST 05:00)定期実行される。
//
// 各メンバーがマイページで登録した「ユーザーコード」(userCode)を使って、
// 非公式サイト「メトログラフ」(sf6.halipe.co)が公開しているCSVを取得し、
// その日時点での全キャラクター中の最高MRと、全キャラ合計の試合数を算出する。
//
// - currentMR:      今日時点のMR。毎日上書きし、日々の変動(勝敗によるMRの上下)をそのまま反映する。
//                    ランキング(ranking.js)やTOP画面のMRランキングカード(top.js)はこちらを参照する。
// - maxMR:          自己最高MR。currentMRが過去の記録を上回った時だけ更新する(下がらない)。
//                    メンバー一覧・プロフィール(members.js)で、色付けなしの控えめな表示として使う。
// - actBattleCount: 現在のACT(CURRENT_ACT_NUMBER)における全キャラ合計の試合数。
//                    Capcom側でACTが変わると各キャラのbattle_countも0にリセットされるため、
//                    その日のCSVに入っている値の合計がそのままACT内の試合数になる(毎日上書き)。
// - currentActNumber: actBattleCountがどのACTのものかを表す番号(表示用)。
//
// live-status.mjs と同じく、サービスアカウント経由でセキュリティルールをバイパスして
// 書き込むため、クライアント側からの直接書き込みは database.rules.json 側で禁止したままにできる。

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const DATABASE_URL = 'https://workers-lab-test-default-rtdb.asia-southeast1.firebasedatabase.app';

// ====== 現在のACT情報(ACTが切り替わったらここだけ更新すればOK) ======
const CURRENT_ACT_NUMBER = 13;
const CURRENT_ACT_START_DATE = '2026-08-02'; // 表示・参考用(試合数の集計自体はCSV側のリセットに依存)
// ======================================================================

const CSV_URL = (code) =>
  `https://firebasestorage.googleapis.com/v0/b/hali-sf6-20230604.appspot.com/o/myrank%2Fplayer%2F${encodeURIComponent(code)}.csv?alt=media`;

// 「NNN_master_rating」形式の列だけを抽出する(「NNN_master_rating_ranking」は除外)
const MR_COLUMN_REGEX = /^\d{3}_master_rating$/;

// 「NNN_battle_count」形式(キャラごとの合計試合数)の列だけを抽出する
// (「NNN_MMM_battle_count」というキャラ対キャラの内訳列は除外する)
const BATTLE_COUNT_COLUMN_REGEX = /^\d{3}_battle_count$/;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`::error::環境変数 ${name} が設定されていません(GitHub Secretsを確認してください)`);
    process.exit(1);
  }
  return v;
}

// シンプルなRFC4180準拠CSVパーサー(player_nameなどのクォート付きフィールドに対応)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') {
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

  return rows;
}

// 指定したユーザーコードのCSVを取得し、ヘッダーと最新(一番下)の行をオブジェクトとして返す
async function fetchLatestRow(code) {
  const res = await fetch(CSV_URL(code));
  if (!res.ok) {
    throw new Error(`CSV取得に失敗しました (status=${res.status})`);
  }
  const text = await res.text();
  const rows = parseCSV(text);
  if (rows.length < 2) return null;

  const header = rows[0];
  const lastRow = rows[rows.length - 1];
  const obj = {};
  header.forEach((key, idx) => { obj[key] = lastRow[idx]; });
  return obj;
}

// 全キャラクター中の最高MRとそのキャラIDを取得する
// (未プレイのキャラは master_rating が 0 のため自動的に除外される)
function extractMaxMR(row) {
  let maxMR = 0;
  let bestCharId = null;

  for (const key of Object.keys(row)) {
    if (!MR_COLUMN_REGEX.test(key)) continue;
    const value = Number(row[key]);
    if (Number.isFinite(value) && value > maxMR) {
      maxMR = value;
      bestCharId = key.split('_')[0];
    }
  }

  return { mr: maxMR, characterId: bestCharId };
}

// 全キャラクターの試合数(NNN_battle_count)を合計する
// 「253」のようにMR(master_rating)列を持たない集計専用IDが battle_count ブロックにのみ
// 紛れ込んでいる(実キャラ分の合計とほぼ同じ値を持ち、二重計上の原因になる)ため、
// MR列(=実在するキャラクター)を持つIDだけに絞って合計する。
function extractTotalBattleCount(row) {
  // 実在するキャラクターIDの集合(MR列があるものだけ)を作る
  const validCharIds = new Set();
  for (const key of Object.keys(row)) {
    if (MR_COLUMN_REGEX.test(key)) {
      validCharIds.add(key.split('_')[0]);
    }
  }

  let total = 0;
  for (const key of Object.keys(row)) {
    if (!BATTLE_COUNT_COLUMN_REGEX.test(key)) continue;
    const charId = key.split('_')[0];
    if (!validCharIds.has(charId)) continue; // 253などの集計専用IDは除外
    const value = Number(row[key]);
    if (Number.isFinite(value)) total += value;
  }
  return total;
}

async function main() {
  const serviceAccountRaw = requireEnv('FIREBASE_SERVICE_ACCOUNT');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch (e) {
    console.error('::error::FIREBASE_SERVICE_ACCOUNT のJSONが不正です');
    process.exit(1);
  }

  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });
  const db = getDatabase();

  const playersSnap = await db.ref('classical_worker_data/players').get();
  const players = playersSnap.val() || {};

  const targets = Object.keys(players).filter(
    (n) => players[n] && players[n].userCode && String(players[n].userCode).trim() !== ''
  );

  console.log(`MR更新対象: ${targets.length}件 (ACT${CURRENT_ACT_NUMBER} 開始日: ${CURRENT_ACT_START_DATE})`);

  const updates = {};
  let updatedCount = 0;

  for (const name of targets) {
    const code = String(players[name].userCode).trim();
    try {
      const row = await fetchLatestRow(code);
      if (!row) {
        console.log(`スキップ: ${name} のCSVにデータがありません(code=${code})`);
        continue;
      }

      const { mr, characterId } = extractMaxMR(row);
      const totalBattles = extractTotalBattleCount(row);

      // actBattleCount: 現在のACTにおける全キャラ合計試合数(ACTが変わるとCSV側の値ごとリセットされる)
      // MRの有無に関わらず、CSVが取得できた時点で従来通り毎日更新する。
      updates[`classical_worker_data/players/${name}/actBattleCount`] = totalBattles;
      updates[`classical_worker_data/players/${name}/currentActNumber`] = CURRENT_ACT_NUMBER;
      updates[`classical_worker_data/players/${name}/actBattleCountUpdatedAt`] = new Date().toISOString();

      if (mr <= 0) {
        // 有効なMRデータがない(=今ACTでまだランクマッチを行っていない)場合は、
        // currentMRを空にして、表示側で「今ACTランクマッチ未実施」と出せるようにする。
        // 過去の自己最高値(maxMR)はそのまま保持し、上書きしない。
        updates[`classical_worker_data/players/${name}/currentMR`] = '';
        updates[`classical_worker_data/players/${name}/currentMRCharacterId`] = null;

        updatedCount++;
        console.log(`${name}: MRデータなし(今ACTランクマッチ未実施) / ACT${CURRENT_ACT_NUMBER}試合数=${totalBattles} (code=${code})`);
        continue;
      }

      // currentMR: 今日時点のMR。毎日この値で上書きし、日々の変動をそのまま反映する。
      updates[`classical_worker_data/players/${name}/currentMR`] = String(mr);
      updates[`classical_worker_data/players/${name}/currentMRUpdatedAt`] = new Date().toISOString();
      updates[`classical_worker_data/players/${name}/currentMRCharacterId`] = characterId;

      // maxMR: 過去最高値。今日のMRがこれまでの記録を上回った場合のみ更新する。
      const existingMaxMR = parseInt(players[name].maxMR, 10) || 0;
      if (mr > existingMaxMR) {
        updates[`classical_worker_data/players/${name}/maxMR`] = String(mr);
        updates[`classical_worker_data/players/${name}/maxMRUpdatedAt`] = new Date().toISOString();
        updates[`classical_worker_data/players/${name}/maxMRCharacterId`] = characterId;
      }

      updatedCount++;
      console.log(`${name}: 現在MR=${mr}${mr > existingMaxMR ? '(自己最高を更新)' : ''} / ACT${CURRENT_ACT_NUMBER}試合数=${totalBattles} (character=${characterId ?? '-'})`);
    } catch (e) {
      console.warn(`::warning::${name} の取得に失敗しました(code=${code}): ${e.message}`);
      // 1人のエラーで全体を止めず、他のメンバーの処理を続ける
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    console.log(`Firebaseを更新しました(${updatedCount}人分)`);
  } else {
    console.log('更新対象がありませんでした');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
