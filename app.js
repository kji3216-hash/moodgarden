(function() {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#screen-${id}`).classList.add('active');

    $$('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.screen === id);
    });

    if (id === 'garden') refreshGarden();
    if (id === 'insights') Insights.renderAll();
  }

  function showToast(msg, duration) {
    duration = duration || 2500;
    const toast = $('#toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), duration);
  }

  function initChipGroup(groupId, multi) {
    const group = $(`#${groupId}`);
    if (!group) return;

    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      if (multi) {
        chip.classList.toggle('selected');
      } else {
        group.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      }
    });
  }

  function getChipValues(groupId) {
    return [...$$(`#${groupId} .chip.selected`)].map(c => c.dataset.value);
  }

  function getSingleChip(groupId) {
    const selected = $(`#${groupId} .chip.selected`);
    return selected ? selected.dataset.value : null;
  }

  function handleOnboarding(e) {
    e.preventDefault();

    const nickname = $('#inp-nickname').value.trim();
    const birthyear = parseInt($('#inp-birthyear').value);
    const gender = getSingleChip('chip-gender');
    const diagnoses = getChipValues('chip-diagnosis');
    const medications = getChipValues('chip-medication');
    const sleep = getSingleChip('chip-sleep');
    const stressors = $('#inp-stressors').value.trim();

    if (!nickname || !birthyear || !gender) {
      showToast('필수 항목을 채워주세요');
      return;
    }

    MG.saveProfile({ nickname, birthYear: birthyear, gender, diagnoses, medications, sleepPattern: sleep, stressors });
    Scheduler.requestPermission();
    Scheduler.scheduleNotifications();

    showScreen('garden');
    showToast(`환영합니다, ${nickname}님! 🌱`);
  }

  function refreshGarden() {
    const profile = MG.getProfile();
    if (profile) {
      $('#greeting-text').textContent = `${profile.nickname}님의 정원 🌱`;
    }

    Garden.render();
    Garden.renderStampCard();
    Garden.renderStreak();
    updateNextCheckin();
  }

  function updateNextCheckin() {
    const windowInfo = Scheduler.getCurrentWindow();
    if (!windowInfo) return;

    const windowEl = $('#checkin-window');
    const timeEl = $('#checkin-time');
    if (windowEl) windowEl.textContent = windowInfo.label;
    if (timeEl) timeEl.textContent = `${String(windowInfo.start).padStart(2, '0')}:00 - ${String(windowInfo.end).padStart(2, '0')}:00`;
  }

  function determineWindow() {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  function openCheckin() {
    const windowKey = determineWindow();
    const windowLabels = { morning: '오전 체크인', afternoon: '오후 체크인', evening: '저녁 체크인' };

    $('#checkin-window-label').textContent = windowLabels[windowKey];

    $$('.vas-slider').forEach(s => {
      s.value = 35;
      s.dispatchEvent(new Event('input'));
    });

    $$('.context-item input[type="checkbox"]').forEach(c => c.checked = false);

    const freeText = $('#free-text');
    if (freeText) freeText.value = '';

    showScreen('checkin');
  }

  function submitCheckin() {
    const responses = {};
    $$('.vas-slider').forEach(s => {
      responses[s.dataset.key] = parseInt(s.value);
    });

    const context = {};
    $$('.context-item input[type="checkbox"]').forEach(c => {
      context[c.dataset.key] = c.checked;
    });

    const freeText = $('#free-text');
    const note = freeText ? freeText.value.trim() : '';
    const submittedAt = new Date();
    const localDate = MG.toLocalDate(submittedAt);
    const windowKey = determineWindow();
    const scheduledWindow = Scheduler.getWindowByKey(windowKey);

    const checkin = {
      id: MG.buildCheckinId(localDate, windowKey),
      schemaVersion: MG.SCHEMA_VERSION,
      localDate,
      window: windowKey,
      scheduledAt: scheduledWindow && scheduledWindow.scheduledAt ? scheduledWindow.scheduledAt : '',
      submittedAt: submittedAt.toISOString(),
      timestamp: submittedAt.toISOString(),
      timezoneOffset: MG.getTimezoneOffset(submittedAt),
      responses,
      context,
      note
    };

    const result = MG.upsertCheckin(checkin);
    if (!result.replaced) {
      MG.addStamp();
      MG.updateStreak();
    }
    MG.checkUnlocks();

    Garden.addNewPlant(responses);

    showScreen('garden');

    if (result.replaced) {
      showToast('이 시간대 체크인을 업데이트했어요');
      return;
    }

    const streak = MG.getStreak();
    if (streak.milestones && streak.milestones.includes(streak.count) && (streak.count === 7 || streak.count === 14 || streak.count === 30)) {
      showToast(`🎉 ${streak.count}일 연속 달성! 대단해요!`, 4000);
      return;
    }

    const moodMsg = responses.mood >= 70 ? '기분이 좋아 보이네요 🌻' :
                    responses.mood >= 40 ? '오늘도 잘 버텨내고 있어요 🌿' :
                    '힘든 날이지만, 기록한 것만으로도 대단해요 🪻';
    showToast(moodMsg);
  }

  function initApp() {
    const profile = MG.getProfile();

    if (profile) {
      showScreen('garden');
      Scheduler.ensureSchedule();
      Scheduler.scheduleNotifications();
    } else {
      showScreen('onboarding');
    }

    initChipGroup('chip-gender', false);
    initChipGroup('chip-diagnosis', true);
    initChipGroup('chip-medication', true);
    initChipGroup('chip-sleep', false);

    $('#onboarding-form').addEventListener('submit', function(e) { e.preventDefault(); handleOnboarding(e); });
    $('#btn-start').addEventListener('click', function(e) { e.preventDefault(); handleOnboarding(e); });

    if (window.electronAPI) {
      window.electronAPI.onOpenCheckin(() => {
        const profile = MG.getProfile();
        if (profile) openCheckin();
      });
    }

    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.screen;
        if (target === 'checkin') {
          openCheckin();
        } else {
          showScreen(target);
        }
      });
    });

    $('#btn-checkin').addEventListener('click', openCheckin);
    $('#btn-back-garden').addEventListener('click', () => showScreen('garden'));
    $('#btn-submit-checkin').addEventListener('click', submitCheckin);

    $('#btn-export').addEventListener('click', async () => {
      const csv = MG.exportCSV();
      if (!csv) {
        showToast('아직 내보낼 데이터가 없어요');
        return;
      }

      if (window.electronAPI) {
        const defaultName = 'moodgarden_' + MG.toLocalDate() + '.csv';
        const saved = await window.electronAPI.saveCSV(csv, defaultName);
        if (saved) showToast('CSV 파일이 저장되었어요 📤');
        return;
      }

      MG.downloadCSV();
      showToast('CSV 파일이 다운로드되었어요 📤');
    });

    $('#btn-settings').addEventListener('click', () => {
      showToast('설정 기능은 준비 중입니다');
    });

    $$('.vas-slider').forEach(slider => {
      const valueEl = slider.parentElement.querySelector('.vas-value');
      slider.addEventListener('input', () => {
        valueEl.textContent = slider.value;
      });
    });
  }

  window.onerror = function(msg, url, line) {
    alert('Error: ' + msg + ' at line ' + line);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
