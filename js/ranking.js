function switchRankingSubTab(subTab){
  rankingSubTab = subTab;
  renderRanking();
}

function renderRanking(){
  const el = document.getElementById('view-ranking');
  const names = Object.keys(data.players);

  const subTabsHtml = `
    <div class="sub-tabs">
      <div class="sub-tab ${rankingSubTab === 'winrate' ? 'active' : ''}" onclick="switchRankingSubTab('winrate')">🏆 勝率ランキング</div>
      <div class="sub-tab ${rankingSubTab === 'mr' ? 'active' : ''}" onclick="switchRankingSubTab('mr')">📊 MRランキング</div>
      <div class="sub-tab ${rankingSubTab === 'battles' ? 'active' : ''}" onclick="switchRankingSubTab('battles')">🎮 試合数ランキング</div>
    </div>
  `;

  if(rankingSubTab === 'battles'){
    const withBattles = names
      .filter(n => data.players[n].actBattleCount && Number(data.players[n].actBattleCount) > 0)
      .map(n => ({
        name: n,
        count: parseInt(data.players[n].actBattleCount, 10) || 0,
        actNumber: data.players[n].currentActNumber || ''
      }));

    if(withBattles.length === 0){
      el.innerHTML = subTabsHtml + '<div class="empty">試合数が登録されているプレイヤーはいません</div>';
      return;
    }

    withBattles.sort((a,b) => b.count - a.count);
    const actLabel = withBattles[0].actNumber ? `ACT${withBattles[0].actNumber}` : '今シーズン';

    let html = '';
    withBattles.forEach((p, i) => {
      const rankLabel = i + 1;
      const medal = rankLabel === 1 ? '🥇' : rankLabel === 2 ? '🥈' : rankLabel === 3 ? '🥉' : `#${rankLabel}`;
      html += `
        <div class="rank-card ${rankLabel === 1 ? 'r1' : ''}">
          <div class="rank-num">${medal}</div>
          ${data.players[p.name].icon ? `<img class="member-icon" src="${data.players[p.name].icon}" alt="">` : `<div class="member-icon" style="display:flex;align-items:center;justify-content:center;font-size:18px;">👤</div>`}
          <div class="rank-body">
            <div class="rank-top">
              <span class="rank-name">${escapeHtml(p.name)}</span>
              <span class="rank-meta" style="font-size:24px;font-weight:800;">${p.count}<span style="font-size:13px;font-weight:600;color:var(--text-dim);margin-left:2px;">戦</span></span>
            </div>
            ${memberMetaChipsHtml(data.players[p.name])}
          </div>
        </div>`;
    });

    el.innerHTML = subTabsHtml + `
      <div style="margin-bottom:16px;text-align:center;font-size:13px;color:var(--text-dim)">
        ${escapeHtml(actLabel)}の試合数（登録者 ${withBattles.length}名）
      </div>
      ${html}
    `;
    return;
  }

  if(rankingSubTab === 'mr'){
    const withMR = names
      .filter(n => data.players[n].currentMR && String(data.players[n].currentMR).trim() !== '')
      .map(n => ({
        name: n,
        mr: parseInt(data.players[n].currentMR, 10) || 0
      }))
      .filter(p => p.mr > 0);

    if(withMR.length === 0){
      el.innerHTML = subTabsHtml + '<div class="empty">MRが登録されているプレイヤーはいません</div>';
      return;
    }

    withMR.sort((a,b) => b.mr - a.mr);

    let html = '';
    withMR.forEach((p, i) => {
      const color = getMRColor(p.mr);
      const rankLabel = i + 1;
      const medal = rankLabel === 1 ? '🥇' : rankLabel === 2 ? '🥈' : rankLabel === 3 ? '🥉' : `#${rankLabel}`;

      html += `
        <div class="rank-card ${rankLabel === 1 ? 'r1' : ''}">
          <div class="rank-num" style="color:${color}">${medal}</div>
          ${data.players[p.name].icon ? `<img class="member-icon" src="${data.players[p.name].icon}" alt="">` : `<div class="member-icon" style="display:flex;align-items:center;justify-content:center;font-size:18px;">👤</div>`}
          <div class="rank-body">
            <div class="rank-top">
              <span class="rank-name">${escapeHtml(p.name)}</span>
              <span class="rank-meta" style="font-size:26px;font-weight:800;color:${color}">${p.mr}</span>
            </div>
            ${memberMetaChipsHtml(data.players[p.name])}
          </div>
        </div>`;
    });

    const avgMR = withMR.reduce((sum, p) => sum + p.mr, 0) / withMR.length;
    const avgColor = getMRColor(avgMR);

    el.innerHTML = subTabsHtml + `
      <div style="margin-bottom:16px;text-align:center;font-size:13px;color:var(--text-dim)">
        平均MR: <span style="font-weight:800;color:${avgColor};font-size:18px">${avgMR.toFixed(0)}</span>
        （登録者 ${withMR.length}名）
      </div>
      ${html}
    `;
    return;
  }

  const withMatches = names.filter(n => (data.players[n].matches||[]).length>0);
  const withoutMatches = names.filter(n => (data.players[n].matches||[]).length===0);

  withMatches.sort((a,b)=>{
    const sa = computeStats(data.players[a]), sb = computeStats(data.players[b]);
    if(sb.winRate !== sa.winRate) return sb.winRate - sa.winRate;
    return sb.wins - sa.wins;
  });
  withoutMatches.sort((a,b)=>a.localeCompare(b,'ja'));

  const ordered = [...withMatches, ...withoutMatches];

  if(ordered.length===0){
    el.innerHTML = subTabsHtml + '<div class="empty">まだ参加者がいません。マイページから登録してください。</div>';
    return;
  }

  let html = '';
  ordered.forEach((name, i)=>{
    const s = computeStats(data.players[name]);
    const rankLabel = s.total>0 ? (i+1) : '–';
    const goalText = s.goalAchievement!==null ? `${s.goalDone}/${s.goalTotal}` : '未設定';
    html += `
      <div class="rank-card ${i===0 && s.total>0 ? 'r1':''}">
        <div class="rank-num">${rankLabel}</div>
        ${data.players[name].icon ? `<img class="member-icon" src="${data.players[name].icon}" alt="">` : `<div class="member-icon" style="display:flex;align-items:center;justify-content:center;font-size:18px;">👤</div>`}
        <div class="rank-body">
          <div class="rank-top">
            <span class="rank-name">${escapeHtml(name)}</span>
            <span class="rank-meta">${s.total}戦 ${s.wins}勝</span>
          </div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <div style="flex:1;text-align:center;padding:8px 4px;background:rgba(255,255,255,0.04);border-radius:8px;">
              <div style="font-size:10px;color:var(--text-dim);margin-bottom:2px;">勝率</div>
              <div style="font-size:20px;font-weight:800;color:var(--win);">${s.winRate.toFixed(0)}%</div>
            </div>
            <div style="flex:1;text-align:center;padding:8px 4px;background:rgba(255,255,255,0.04);border-radius:8px;">
              <div style="font-size:10px;color:var(--text-dim);margin-bottom:2px;">目標</div>
              <div style="font-size:20px;font-weight:800;color:var(--goal);">${goalText}</div>
            </div>
          </div>
          ${memberMetaChipsHtml(data.players[name])}
        </div>
      </div>`;
  });
  el.innerHTML = subTabsHtml + html;
}



function renderCurrentPage(){
  renderRanking();
}

(async function(){
  document.getElementById('view-ranking').innerHTML = '<div class="empty">読み込み中...</div>';
  await initPage();
})();
