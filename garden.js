const Garden = {
  PLANTS: {
    sunflower: { emoji: '🌻', name: '해바라기', threshold: 70 },
    herb: { emoji: '🌿', name: '관엽식물', thresholdMin: 40, thresholdMax: 69 },
    lavender: { emoji: '🪻', name: '라벤더', threshold: 39 },
    blossom: { emoji: '🌸', name: '벚꽃', ruminationHigh: true },
    tree: { emoji: '🌳', name: '나무', milestone: true },
    seedling: { emoji: '🌱', name: '새싹', default: true }
  },

  getPlantForCheckin(responses) {
    const mood = responses.mood;
    const rumination = responses.rumination;

    if (rumination > 70 && mood < 40) return this.PLANTS.blossom;
    if (mood >= 70) return this.PLANTS.sunflower;
    if (mood >= 40) return this.PLANTS.herb;
    return this.PLANTS.lavender;
  },

  render() {
    const container = document.getElementById('garden');
    if (!container) return;

    const ground = container.querySelector('.garden-ground');
    container.querySelectorAll('.garden-plant').forEach(p => p.remove());

    const checkins = MG.getCheckins();
    if (checkins.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'position:absolute;bottom:50px;left:50%;transform:translateX(-50%);color:#6d4c41;font-size:14px;text-align:center;';
      empty.textContent = '체크인하면 식물이 자라요 🌱';
      container.appendChild(empty);
      return;
    }

    const recentCheckins = checkins.slice(-14);
    const positions = this.generatePositions(recentCheckins.length);

    recentCheckins.forEach((checkin, i) => {
      const plant = this.getPlantForCheckin(checkin.responses);
      const el = document.createElement('div');
      el.className = 'garden-plant';
      el.textContent = plant.emoji;
      el.style.left = positions[i].x + '%';
      el.style.bottom = positions[i].y + 'px';
      el.style.fontSize = positions[i].size + 'px';
      container.appendChild(el);
    });

    const streak = MG.getStreak();
    if (streak.count >= 7) {
      const tree = document.createElement('div');
      tree.className = 'garden-plant';
      tree.textContent = '🌳';
      tree.style.left = '50%';
      tree.style.bottom = '35px';
      tree.style.fontSize = '38px';
      tree.style.transform = 'translateX(-50%)';
      container.appendChild(tree);
    }
  },

  generatePositions(count) {
    const positions = [];
    const cols = Math.min(count, 5);
    const rows = Math.ceil(count / cols);

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const xBase = (col + 0.5) / cols * 90 + 5;
      const jitterX = (Math.random() - 0.5) * 8;
      const yBase = 45 + row * 35;
      const jitterY = (Math.random() - 0.5) * 10;
      const size = 22 + Math.random() * 10;

      positions.push({
        x: Math.max(5, Math.min(90, xBase + jitterX)),
        y: Math.max(35, yBase + jitterY),
        size: size
      });
    }

    return positions;
  },

  addNewPlant(responses) {
    const container = document.getElementById('garden');
    if (!container) return;

    const plant = this.getPlantForCheckin(responses);

    const existing = container.querySelectorAll('.garden-plant');
    const x = 10 + Math.random() * 80;
    const y = 40 + Math.random() * 100;

    const el = document.createElement('div');
    el.className = 'garden-plant new-plant';
    el.textContent = plant.emoji;
    el.style.left = x + '%';
    el.style.bottom = y + 'px';
    el.style.fontSize = '28px';
    container.appendChild(el);

    setTimeout(() => el.classList.remove('new-plant'), 600);
  },

  renderStampCard() {
    const stamps = MG.getStamps();
    const slotsEl = document.getElementById('stamp-slots');
    const progressEl = document.getElementById('stamp-progress');
    if (!slotsEl) return;

    slotsEl.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const slot = document.createElement('div');
      slot.className = 'stamp-slot' + (i < stamps.slots.length ? ' filled' : '');
      slot.textContent = i < stamps.slots.length ? '⭐' : '';
      slotsEl.appendChild(slot);
    }

    if (progressEl) {
      progressEl.textContent = `${stamps.slots.length} / 7` +
        (stamps.completedCards > 0 ? ` (${stamps.completedCards}장 완료)` : '');
    }
  },

  renderStreak() {
    const streak = MG.getStreak();
    const countEl = document.getElementById('streak-count');
    const flameEl = document.getElementById('streak-flame');
    const freezeEl = document.getElementById('streak-freeze');

    if (countEl) countEl.textContent = streak.count;
    if (flameEl) {
      if (streak.count >= 30) flameEl.textContent = '🔥';
      else if (streak.count >= 7) flameEl.textContent = '🌿';
      else flameEl.textContent = '🌱';
    }
    if (freezeEl) freezeEl.textContent = `❄️ x${streak.freezes}`;
  }
};
