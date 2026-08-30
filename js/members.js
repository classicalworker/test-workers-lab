function renderMembers(){
  const el = document.getElementById('view-members');
  selectedMember = null;
  
  const names = Object.keys(data.players).slice().sort((a,b)=>a.localeCompare(b,'ja'));
  if(names.length===0){
    el.innerHTML = '<div class="empty">まだ参加者がいません。マイページから登録してください。</div>';
    return;
  }
  const cardsHtml = names.map(name=>{
    const p = data.players[name];
    const s = computeStats(p);
    const iconHtml = p.icon
      ? `<img class="member-card-icon" src="${p.icon}" alt="">`
      : `<div class="member-card-icon-ph">👤</div>`;
    const deviceRow = deviceChipsHtml(p);
    const formatChip = formatChipHtml(p);
    const platformRow = platformChipsHtml(p);
    const metaRowHtml = (deviceRow || formatChip || platformRow)
      ? `<div class="member-meta-row">${formatChip}${deviceRow}${platformRow}</div>`
      : '';
    const goalHtml = p.mainGoal
      ? `<div class="member-card-goal">${p.mainGoalDone?'✅':'🎯'} ${escapeHtml(p.mainGoal)}</div>`
      : `<div class="member-card-goal member-card-goal-empty">🎯 未設定</div>`;
    return `
      <div class="member-card" onclick="viewMember('${name.replace(/'/g,"\\'")}')">
        ${iconHtml}
        <div class="member-card-body">
          <div class="member-card-name">${escapeHtml(name)}</div>
          ${p.currentMR
            ? `<div class="member-card-mr" style="color:${getMRColor(parseInt(p.currentMR)||0)}">MR ${escapeHtml(p.currentMR)}${p.maxMR ? ` <span style="color:var(--text-dim);font-weight:400;font-size:11px;">(最大 ${escapeHtml(p.maxMR)})</span>` : ''}</div>`
            : (p.userCode
                ? `<div class="member-card-mr" style="color:var(--text-dim);font-weight:400;">今ACTランクマッチ未実施${p.maxMR ? ` <span style="color:var(--text-dim);font-weight:400;font-size:11px;">(最大 ${escapeHtml(p.maxMR)})</span>` : ''}</div>`
                : (p.maxMR ? `<div class="member-card-mr" style="color:var(--text-dim);font-weight:400;">最大MR ${escapeHtml(p.maxMR)}</div>` : ''))}
          ${p.actBattleCount ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">ACT${escapeHtml(String(p.currentActNumber||''))} ${escapeHtml(String(p.actBattleCount))}戦</div>` : ''}
          ${goalHtml}
          <div class="member-card-record">${s.total}戦 ${s.wins}勝</div>
          ${metaRowHtml}
        </div>
      </div>`;
  }).join('');
  el.innerHTML = `<div class="member-grid">${cardsHtml}</div>`;
}

function viewMember(name){ 
  const el = document.getElementById('view-members');
  const p = data.players[name];
  const s = computeStats(p);
  const controlLabel = (p.controlTypes||[]).join('/') || '未設定';

  const mainGoalHtml = p.mainGoal
    ? `<div class="main-goal">${p.mainGoalDone?'✅':'🎯'} ${escapeHtml(p.mainGoal)}${p.mainGoalDone?' <span style="font-family:var(--font-mono);font-size:10px;color:var(--win)">達成済み</span>':''}</div>`
    : `<div class="main-goal empty-goal">目標は未設定です</div>`;

  const goals = p.goals || [];
  const goalsHtml = goals.length>0
    ? goals.map(g=>`<div class="history-item"><span style="${g.done?'color:var(--win);text-decoration:line-through':''}">${g.done?'✅':'▫️'} ${escapeHtml(g.text)}</span></div>`).join('')
    : '<div class="empty" style="padding:10px 0">ミッションはまだありません</div>';

  const matches = (p.matches||[]).slice().reverse().slice(0,10);
  const historyHtml = matches.length>0
    ? matches.map(m=>{
        const scoreStr = m.score ? `(${escapeHtml(m.score)})` : '';
        const eventStr = m.eventName || '';
        // 大会名の表示を改善（勝敗に関わらず同じアイコン・色、リンクありは黄色、新規入力は灰色）
        const eventBadge = eventStr
          ? (m.eventId && m.eventType
              ? `<span class="tournament-badge" onclick="jumpToEvent('${escapeHtml(m.eventId)}','${escapeHtml(m.eventType)}')">${escapeHtml(eventStr)}</span>`
              : `<span class="tournament-badge manual-badge">${escapeHtml(eventStr)}</span>`)
          : '';
        return `<div class="history-item">
          <div class="history-main">
            <div class="top">
              <span class="names">${escapeHtml(name)} vs ${escapeHtml(m.opponent)}</span>
              ${eventBadge}
            </div>
            ${scoreStr ? `<div class="score-display"><span class="score-me">${scoreStr.split('-')[0]}</span><span class="vs">vs</span><span class="score-opp">${scoreStr.split('-')[1]||''}</span></div>` : ''}
          </div>
          <span class="pill ${m.result}">${m.result==='win'?'WIN':'LOSE'}</span>
        </div>`;
      }).join('')
    : '<div class="empty">まだ記録がありません</div>';

  const mrColor = p.currentMR ? getMRColor(parseInt(p.currentMR)||0) : 'var(--text-dim)';
  const deviceRowDetail = deviceChipsHtml(p);
  const platformRowDetail = platformChipsHtml(p);
  const iconHeaderHtml = p.icon ? `<img class="member-icon-lg" src="${p.icon}" alt="">` : '';

  el.innerHTML = `
    <button class="ghost" onclick="renderMembers()">← メンバー一覧へ戻る</button>
    <div class="card" style="margin-top:12px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
        ${iconHeaderHtml}
        <h2 style="margin:0">${escapeHtml(name)}<span class="tag" style="background:none;color:var(--text-dim);font-weight:400;padding:0;font-size:16px;">操作:${escapeHtml(controlLabel)}</span></h2>
      </div>
      ${p.currentMR
        ? `<div style="font-family:var(--font-mono);font-size:22px;font-weight:800;color:${mrColor};margin-bottom:4px">MR: ${escapeHtml(p.currentMR)}</div>`
        : (p.userCode ? `<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--text-dim);margin-bottom:4px">今ACTランクマッチ未実施</div>` : '')}
      ${p.maxMR ? `<div style="font-family:var(--font-mono);font-size:16px;color:var(--text-dim);margin-bottom:4px">最大MR: ${escapeHtml(p.maxMR)}</div>` : ''}
      ${p.actBattleCount ? `<div style="font-family:var(--font-mono);font-size:16px;color:var(--text-dim);margin-bottom:8px">ACT${escapeHtml(String(p.currentActNumber||''))}: ${escapeHtml(String(p.actBattleCount))}戦</div>` : ''}
      ${p.userCode ? `<div class="member-usercode" style="margin-bottom:6px">🆔 ${escapeHtml(p.userCode)}</div>` : ''}
      ${(deviceRowDetail || platformRowDetail) ? `<div class="member-meta-row" style="margin-bottom:6px">${deviceRowDetail}${platformRowDetail}</div>` : ''}
      <div style="display:flex;gap:10px;margin-top:12px;">
        <div style="flex:1;text-align:center;padding:12px 8px;background:rgba(255,255,255,0.04);border-radius:10px;">
          <div style="font-size:11px;color:var(--text-dim);letter-spacing:.03em;margin-bottom:4px;">勝率</div>
          <div style="font-size:26px;font-weight:800;color:var(--win);">${s.winRate.toFixed(0)}%</div>
        </div>
        <div style="flex:1;text-align:center;padding:12px 8px;background:rgba(255,255,255,0.04);border-radius:10px;">
          <div style="font-size:11px;color:var(--text-dim);letter-spacing:.03em;margin-bottom:4px;">目標達成</div>
          <div style="font-size:26px;font-weight:800;color:var(--goal);">${s.goalAchievement!==null?s.goalDone+'/'+s.goalTotal:'–'}</div>
        </div>
      </div>
      <div class="rank-meta" style="margin-top:10px;text-align:center;font-size:14px;">${s.total}戦 ${s.wins}勝</div>
    </div>

    <div class="card">
      <h2>🎯 目標</h2>
      ${mainGoalHtml}
      <label style="margin-top:14px">ミッション</label>
      ${goalsHtml}
    </div>

    <div class="card">
      <h2>直近の対戦履歴</h2>
      ${historyHtml}
    </div>`;

  // 未読の対戦通知があればポップアップで通知する
  showMatchNotifications(name, p);
}

// 未読の対戦通知をポップアップで表示する（自分のマイページ／メンバー一覧からの閲覧の両方で使用）

function renderCurrentPage(){
  renderMembers();
}

(async function(){
  document.getElementById('view-members').innerHTML = '<div class="empty">読み込み中...</div>';
  await initPage();
})();
