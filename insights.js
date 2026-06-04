const Insights = {
  mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },

  sd(arr) {
    const m = this.mean(arr);
    return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length);
  },

  pearson(x, y) {
    const n = x.length;
    if (n < 3) return 0;
    const mx = this.mean(x);
    const my = this.mean(y);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      dx += (x[i] - mx) ** 2;
      dy += (y[i] - my) ** 2;
    }
    const denom = Math.sqrt(dx * dy);
    return denom === 0 ? 0 : num / denom;
  },

  getDailyAverages() {
    const checkins = MG.getCheckins();
    const byDay = {};

    checkins.forEach(c => {
      const day = c.timestamp.slice(0, 10);
      if (!byDay[day]) byDay[day] = { mood: [], anhedonia: [], energy: [], hopelessness: [], rumination: [] };
      Object.keys(c.responses).forEach(k => byDay[day][k].push(c.responses[k]));
    });

    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, vals]) => ({
        day,
        mood: this.mean(vals.mood),
        anhedonia: this.mean(vals.anhedonia),
        energy: this.mean(vals.energy),
        hopelessness: this.mean(vals.hopelessness),
        rumination: this.mean(vals.rumination),
        count: vals.mood.length
      }));
  },

  getIntradayVariability() {
    const checkins = MG.getCheckins();
    const byDay = {};

    checkins.forEach(c => {
      const day = c.timestamp.slice(0, 10);
      if (!byDay[day]) byDay[day] = { mood: [] };
      byDay[day].mood.push(c.responses.mood);
    });

    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, vals]) => ({
        day,
        sd: vals.mood.length >= 2 ? this.sd(vals.mood) : 0,
        range: vals.mood.length >= 2 ? Math.max(...vals.mood) - Math.min(...vals.mood) : 0,
        count: vals.mood.length
      }));
  },

  computeLagCorrelations() {
    const checkins = MG.getCheckins();
    if (checkins.length < 10) return [];

    const keys = ['mood', 'anhedonia', 'energy', 'hopelessness', 'rumination'];
    const results = [];

    for (const predictor of keys) {
      for (const outcome of keys) {
        if (predictor === outcome) continue;
        const x = [];
        const y = [];
        for (let i = 1; i < checkins.length; i++) {
          x.push(checkins[i - 1].responses[predictor]);
          y.push(checkins[i].responses[outcome]);
        }
        const r = this.pearson(x, y);
        if (Math.abs(r) > 0.25) {
          results.push({
            predictor,
            outcome,
            r: r,
            strength: Math.abs(r) > 0.5 ? '강함' : '보통',
            direction: r > 0 ? '양의' : '음의'
          });
        }
      }
    }

    return results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 5);
  },

  renderAll() {
    const { unlocked, days } = MG.checkUnlocks();

    const lockedEl = document.getElementById('insights-locked');
    const trajectoryEl = document.getElementById('insight-trajectory');
    const variabilityEl = document.getElementById('insight-variability');
    const lagEl = document.getElementById('insight-lag');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const lockedMsg = document.getElementById('locked-msg');

    const hasAny = unlocked.trajectory || unlocked.variability || unlocked.lag;

    if (lockedEl) {
      if (hasAny) {
        lockedEl.style.display = 'none';
      } else {
        lockedEl.style.display = 'block';
        if (progressFill) progressFill.style.width = Math.min(100, (days / 4) * 100) + '%';
        if (progressText) progressText.textContent = `${days} / 4 일`;
        if (lockedMsg) lockedMsg.textContent = '4일 차부터 일별 궤적이 보입니다';
      }
    }

    if (trajectoryEl) {
      if (unlocked.trajectory) {
        trajectoryEl.classList.remove('hidden');
        this.renderTrajectory();
      } else {
        trajectoryEl.classList.add('hidden');
      }
    }

    if (variabilityEl) {
      if (unlocked.variability) {
        variabilityEl.classList.remove('hidden');
        this.renderVariability();
      } else {
        variabilityEl.classList.add('hidden');
      }
    }

    if (lagEl) {
      if (unlocked.lag) {
        lagEl.classList.remove('hidden');
        this.renderLag();
      } else {
        lagEl.classList.add('hidden');
      }
    }
  },

  renderTrajectory() {
    const container = document.getElementById('chart-trajectory');
    const summary = document.getElementById('trajectory-summary');
    if (!container) return;

    const daily = this.getDailyAverages();
    if (daily.length === 0) return;

    const svg = this.createLineChart(daily.map(d => d.mood), daily.map(d => d.day.slice(5)));
    container.innerHTML = '';
    container.appendChild(svg);

    if (summary) {
      const moods = daily.map(d => d.mood);
      const best = daily.reduce((a, b) => a.mood > b.mood ? a : b);
      const worst = daily.reduce((a, b) => a.mood < b.mood ? a : b);
      summary.innerHTML = `
        이번 기간 평균: <strong>${Math.round(this.mean(moods))}점</strong><br>
        가장 좋았던 날: <strong>${best.day.slice(5)} (${Math.round(best.mood)}점)</strong><br>
        가장 힘들었던 날: <strong>${worst.day.slice(5)} (${Math.round(worst.mood)}점)</strong>
      `;
    }
  },

  renderVariability() {
    const container = document.getElementById('chart-variability');
    const summary = document.getElementById('variability-summary');
    if (!container) return;

    const varData = this.getIntradayVariability();
    if (varData.length === 0) return;

    const maxSD = Math.max(...varData.map(d => d.sd), 1);

    let html = '';
    varData.forEach(d => {
      const pct = (d.sd / maxSD) * 100;
      const label = d.sd < 10 ? '안정' : d.sd < 25 ? '보통' : '출렁임 큼';
      html += `
        <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
          <span style="width:35px;font-size:13px;color:var(--text-secondary)">${d.day.slice(5)}</span>
          <div style="flex:1;height:20px;background:#eee;border-radius:4px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--green),var(--yellow),var(--orange));border-radius:4px;transition:width 0.5s;"></div>
          </div>
          <span style="width:65px;font-size:12px;color:var(--text-secondary);text-align:right;">SD=${Math.round(d.sd)} ${label}</span>
        </div>`;
    });

    container.innerHTML = html;

    if (summary) {
      const highVarDays = varData.filter(d => d.sd >= 25);
      if (highVarDays.length > 0) {
        summary.innerHTML = `💡 ${highVarDays.map(d => d.day.slice(5)).join(', ')}에 기분 변동이 컸어요.`;
      } else {
        summary.innerHTML = '💡 이번 기간엔 기분이 비교적 안정적이었어요.';
      }
    }
  },

  renderLag() {
    const container = document.getElementById('lag-results');
    if (!container) return;

    const corrs = this.computeLagCorrelations();

    if (corrs.length === 0) {
      container.innerHTML = '<p style="color:var(--text-secondary)">아직 유의미한 패턴이 감지되지 않았습니다. 더 많은 데이터가 필요해요.</p>';
      return;
    }

    const keyNames = {
      mood: '기분', anhedonia: '무쾌감증', energy: '에너지',
      hopelessness: '절망감', rumination: '반추'
    };

    let html = '';
    corrs.forEach(c => {
      const emoji = c.direction === '음의' ? '📉' : '📈';
      html += `
        <div style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
          ${emoji} <strong>${keyNames[c.predictor]}</strong> → 다음 <strong>${keyNames[c.outcome]}</strong><br>
          <span style="color:var(--text-secondary);font-size:14px;">
            ${keyNames[c.predictor]}이(가) ${c.direction === '음의' ? '낮을 때' : '높을 때'}
            다음 ${keyNames[c.outcome]}이(가) ${Math.abs(Math.round(c.r * 100))}% 정도
            ${c.direction === '음의' ? '낮아지는' : '높아지는'} 경향 (r=${c.r.toFixed(2)}, ${c.strength})
          </span>
        </div>`;
    });

    container.innerHTML = html;
  },

  createLineChart(values, labels) {
    const w = 320, h = 160;
    const padTop = 20, padBot = 30, padLeft = 30, padRight = 10;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBot;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    for (let v = 0; v <= 100; v += 25) {
      const y = padTop + chartH - (v / 100) * chartH;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padLeft); line.setAttribute('x2', w - padRight);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', '#eee'); line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', padLeft - 5); text.setAttribute('y', y + 4);
      text.setAttribute('text-anchor', 'end'); text.setAttribute('font-size', '10');
      text.setAttribute('fill', '#999'); text.textContent = v;
      svg.appendChild(text);
    }

    if (values.length < 2) return svg;

    const points = values.map((v, i) => ({
      x: padLeft + (i / (values.length - 1)) * chartW,
      y: padTop + chartH - (v / 100) * chartH
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#6c5ce7');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    const areaD = pathD + ` L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('d', areaD);
    area.setAttribute('fill', 'rgba(108,92,231,0.1)');
    svg.appendChild(area);

    points.forEach((p, i) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', p.x); circle.setAttribute('cy', p.y);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', '#6c5ce7');
      circle.setAttribute('stroke', 'white'); circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);
    });

    points.forEach((p, i) => {
      if (labels[i]) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', p.x); text.setAttribute('y', h - 5);
        text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '9');
        text.setAttribute('fill', '#999'); text.textContent = labels[i];
        svg.appendChild(text);
      }
    });

    return svg;
  }
};
