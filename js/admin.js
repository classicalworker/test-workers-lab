// ===== 管理者ページ =====
// 管理者PIN(data.admin.pinHash)でこのタブをアンロックすると、
// ・メンバーの追加/削除
// ・予定/大会情報の編集(schedule.html側の編集・削除ボタンもここでアンロックされる)
// ・メンバーごとのデータ編集(マイページへショートカット、PIN確認スキップ)
// が行えるようになる。

function renderCurrentPage(){
  renderAdmin();
}

function renderAdmin(){
  const el = document.getElementById('view-admin');
  if(!isAdminUnlocked()){
    el.innerHTML = lockedScreenHtml();
    return;
  }
  el.innerHTML = adminDashboardHtml();
}

function lockedScreenHtml(){
  const hasPinSet = !!(data.admin && data.admin.pinHash);
  return `
    <div class="card">
      <h2>⚙️ 管理者ページ</h2>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.7;margin-bottom:14px;">
        ${hasPinSet
          ? 'サブリーダー間で共有している管理者PINを入力してください。'
          : 'このタブではまだ管理者PINが設定されていません。最初にPINを設定してください。'}
      </div>
      <button class="primary" onclick="adminLoginPrompt()">${hasPinSet ? '🔐 管理者PINを入力してログイン' : '🔐 管理者PINを新規設定'}</button>
    </div>`;
}

function adminLoginPrompt(){
  // asLogin=true: この画面からのログインは「管理者としてサイト全体にログイン」する扱いにし、
  // 現在ログイン中のメンバーアカウントからは自動的にログアウトする
  requireAdminPin(()=>{
    renderAdmin();
    renderLoginStatusBar();
    showToast('管理者としてログインしました');
  }, null, true);
}

function adminLogoutAndRender(){
  // 管理者としてサイト全体にログイン中だった場合は、通常のログアウトと同様に
  // ログイン画面まで戻す(メンバーとしてのログイン状態も残っていないため)
  if(getLoggedInPlayer() === '__admin__'){
    memberLogout();
    return;
  }
  // メンバー本人のまま管理者権限だけを一時的にアンロックしていた場合は、
  // その権限だけを解除してこのページに留まる
  adminLogout();
  renderAdmin();
  showToast('管理者権限をログアウトしました');
}

function adminDashboardHtml(){
  return `
    <div class="card">
      <h2>⚙️ 管理者ページ<span class="tag">ADMIN</span></h2>
      <div style="font-size:12px;color:var(--text-dim);line-height:1.6;">
        このタブは管理者としてログイン中です。予定・目標ページの編集/削除ボタンもこのタブでは確認なしで使えます。
      </div>
      <button class="ghost" style="margin-top:10px;" onclick="adminLogoutAndRender()">ログアウト</button>
    </div>

    ${adminMemberManageHtml()}
    ${adminScheduleShortcutHtml()}
    ${adminMemberEditHtml()}
    ${adminAnnouncementsHtml()}
  `;
}

// ---- ① メンバーの追加・削除 ----
function adminMemberManageHtml(){
  const names = Object.keys(data.players).sort((a,b)=>a.localeCompare(b,'ja'));
  const rowsHtml = names.length ? names.map(n=>{
    const p = data.players[n];
    const matchCount = (p.matches||[]).length;
    const pinText = p.pin ? p.pin : '未設定';
    return `
      <div class="history-item">
        <div class="history-main">
          <div class="top"><span class="names">${escapeHtml(n)}</span></div>
          <div class="score-display">対戦数 ${matchCount}　／　PIN: <span class="top-card-highlight">${escapeHtml(pinText)}</span></div>
        </div>
        <button class="ghost" onclick="adminDeleteMember('${escapeHtml(n)}')">削除</button>
      </div>`;
  }).join('') : '<div class="empty">メンバーが登録されていません</div>';

  return `
    <div class="card">
      <h2><span class="tag">STEP 1</span>メンバーの追加・削除</h2>
      <div style="max-height:340px;overflow-y:auto;">${rowsHtml}</div>
      <label>新しいメンバーを追加</label>
      <div class="row">
        <input type="text" id="admin-new-member-name" placeholder="例:ハヤト">
        <button class="primary" style="margin-top:0;width:auto;padding:10px 18px;" onclick="adminAddMember()">追加</button>
      </div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:8px;line-height:1.6;">
        削除すると、そのメンバーの対戦履歴・目標もすべて削除されます。元に戻せないのでご注意ください。<br>
        PINコードはメンバーがログイン時に設定するとここに表示されます(平文で保存されるため、管理者以外に見られないようご注意ください)。
      </div>
    </div>`;
}

async function adminAddMember(){
  const input = document.getElementById('admin-new-member-name');
  const name = input.value.trim();
  if(!name){ showToast('名前を入力してください'); return; }
  if(data.players[name]){ showToast('その名前は既に登録されています'); return; }
  data.players[name] = {
    matches:[], goals:[], controlTypes:[], maxMR:'', currentMR:'', seasonStartMR:'', mainGoal:'', mainGoalDone:false, mainGoalAchievedAt:null,
    userCode:'', devices:[], deviceName:'', platforms:[], icon:'', notifications:[],
    streamUrl:'', streamTitle:'', isLive:false,
    twitchLogin:'', pin:''
  };
  await saveData();
  renderAdmin();
  showToast(`${name}さんを追加しました`);
}

async function adminDeleteMember(name){
  if(!await confirmDialog(`${name}さんを削除します。対戦履歴・目標もすべて削除され、元に戻せません。よろしいですか?`)) return;
  delete data.players[name];
  await saveData();
  renderAdmin();
  showToast('削除しました');
}

// ---- ② 大会情報・日程の登録編集 ----
function adminScheduleShortcutHtml(){
  const eventCount = (data.events||[]).length;
  const tournamentCount = (data.tournaments||[]).length;
  return `
    <div class="card">
      <h2><span class="tag">STEP 2</span>大会情報・日程の登録編集</h2>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.7;margin-bottom:12px;">
        登録中の予定: <span class="top-card-highlight">${eventCount}件</span> ／ 大会記録: <span class="top-card-highlight">${tournamentCount}件</span><br>
        予定・大会記録の追加・編集・削除は「予定」ページから行えます。このタブでは管理者ログイン中のため、PIN確認なしでそのまま操作できます。<br>
        出欠確認の回答も、各予定の出欠内訳に並ぶメンバー名の「×」ボタンから個人ごとに取り消せます(管理者ログイン中のみ表示されます)。
      </div>
      <a class="top-link-btn" href="schedule.html">📅 予定ページを開く</a>
    </div>`;
}

// ---- ③ 全員のデータを編集 ----
function adminMemberEditHtml(){
  const names = Object.keys(data.players).sort((a,b)=>a.localeCompare(b,'ja'));
  const rowsHtml = names.length ? names.map(n=>{
    const p = data.players[n];
    return `
      <div class="match-edit-row" style="flex-wrap:wrap;">
        <div style="flex:1;min-width:90px;font-weight:800;font-size:13px;">${escapeHtml(n)}</div>
        <input type="text" value="${escapeHtml(p.mainGoal||'')}" placeholder="大目標"
          onchange="adminUpdatePlayerField('${escapeHtml(n)}','mainGoal',this.value)">
        <input type="text" value="${escapeHtml(p.maxMR||'')}" placeholder="最高MR" style="max-width:90px;"
          onchange="adminUpdatePlayerField('${escapeHtml(n)}','maxMR',this.value)">
        <input type="text" value="${escapeHtml(p.seasonStartMR||'')}" placeholder="シーズン開始MR" style="max-width:110px;"
          onchange="adminUpdatePlayerField('${escapeHtml(n)}','seasonStartMR',this.value)">
        <label style="display:flex;align-items:center;gap:4px;margin:0;flex-shrink:0;font-size:11px;">
          <input type="checkbox" style="width:15px;height:15px;" ${p.mainGoalDone?'checked':''}
            onchange="adminUpdatePlayerField('${escapeHtml(n)}','mainGoalDone',this.checked)">達成
        </label>
        <a class="top-link-btn" href="mypage.html?player=${encodeURIComponent(n)}">詳細編集</a>
      </div>`;
  }).join('') : '<div class="empty">メンバーが登録されていません</div>';

  return `
    <div class="card">
      <h2><span class="tag">STEP 3</span>全員のデータを編集</h2>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:10px;">
        大目標・最高MR・シーズン開始MR・達成フラグはここから直接編集できます。対戦履歴や個人目標リストなど詳しい編集は「詳細編集」からマイページを開いてください(管理者ログイン中はPIN確認なしで開けます)。<br>
        「シーズン開始MR」はCWR(コミュニティ貢献度)の②安定感貢献度の算出に使います。新シーズン開始時に下のボタンで全員分をまとめて記録できます。
      </div>
      <button class="ghost" style="margin-bottom:12px;" onclick="adminSnapshotSeasonStartMR()">🔄 全員の現在MRをシーズン開始MRとして一括記録</button>
      ${rowsHtml}
    </div>`;
}

// 新シーズン開始時に、全員の「現在MR」をそのまま「シーズン開始MR」として一括コピーする
async function adminSnapshotSeasonStartMR(){
  if(!await confirmDialog('全員の現在MRを「シーズン開始MR」として上書き記録します。よろしいですか?')) return;
  let count = 0;
  Object.keys(data.players).forEach(n=>{
    const p = data.players[n];
    if(p.currentMR){
      p.seasonStartMR = p.currentMR;
      count++;
    }
  });
  await saveData();
  renderAdmin();
  showToast(`${count}名分のシーズン開始MRを記録しました`);
}

async function adminUpdatePlayerField(name, field, value){
  const p = data.players[name];
  if(!p) return;
  if(field === 'mainGoalDone' && value && !p.mainGoalDone){
    p.mainGoalAchievedAt = new Date().toISOString();
    if(p.mainGoal) pushAnnouncement(`🎉 ${name}さんが目標を達成しました:「${p.mainGoal}」`);
  } else if(field === 'mainGoalDone' && !value){
    p.mainGoalAchievedAt = null;
  }
  p[field] = value;
  await saveData();
  showToast('更新しました');
}

// ---- ④ お知らせの手動追加・ピン止め・削除 ----
function adminAnnouncementsHtml(){
  const items = sortedAnnouncements();
  const rowsHtml = items.length ? items.map(a=>`
    <div class="notice-item">
      <div style="flex:1;min-width:0;">
        <div class="notice-item-text">${a.pinned ? '📌 ' : ''}${escapeHtml(a.text)}</div>
        <div class="notice-item-time">${formatTimeAgo(a.at)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="ghost" onclick="adminTogglePinAnnouncement('${a.id}')">${a.pinned ? 'ピン解除' : '📌 ピン止め'}</button>
        <button class="ghost" onclick="adminDeleteAnnouncement('${a.id}')">削除</button>
      </div>
    </div>`).join('') : '<div class="empty">お知らせはありません</div>';

  return `
    <div class="card">
      <h2><span class="tag">STEP 4</span>お知らせの手動追加・削除</h2>
      <label>お知らせ本文</label>
      <input type="text" id="admin-new-announcement-text" placeholder="例:来月のオフ会について相談中です">
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer">
        <input type="checkbox" id="admin-new-announcement-pin">
        <span style="color:var(--text)">📌 ピン止めする(TOP画面の一番上に固定表示)</span>
      </label>
      <button class="primary" style="margin-top:10px;" onclick="adminAddAnnouncement()">お知らせを追加</button>
      <div style="max-height:340px;overflow-y:auto;margin-top:14px;display:flex;flex-direction:column;gap:8px;">${rowsHtml}</div>
    </div>`;
}

async function adminAddAnnouncement(){
  const input = document.getElementById('admin-new-announcement-text');
  const pinCb = document.getElementById('admin-new-announcement-pin');
  const text = input.value.trim();
  if(!text){ showToast('お知らせ内容を入力してください'); return; }
  pushAnnouncement(text, pinCb.checked);
  await saveData();
  renderAdmin();
  showToast('お知らせを追加しました');
}

async function adminTogglePinAnnouncement(id){
  const a = (data.announcements||[]).find(a=>a.id===id);
  if(!a) return;
  a.pinned = !a.pinned;
  await saveData();
  renderAdmin();
}

async function adminDeleteAnnouncement(id){
  if(!await confirmDialog('このお知らせを削除しますか?')) return;
  data.announcements = (data.announcements||[]).filter(a=>a.id!==id);
  await saveData();
  renderAdmin();
  showToast('削除しました');
}

(async function(){
  document.getElementById('view-admin').innerHTML = '<div class="empty">読み込み中...</div>';
  await initPage();
})();
