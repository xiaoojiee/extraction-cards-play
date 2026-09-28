'use strict';

/* 安全区的显示与存档入口。文件读取和导入预览只放在临时弹窗状态中。 */
/* global ui, run, meta, el, btn, refresh, toast, closeModal, saveState, saveMeta,
   exportMeta, previewMetaImport, importMeta, restoreMetaBackup, prepareSafeZone */

function openSettings() {
  if (run || ui.screen !== 'safe') return;
  ui.modal = { kind: 'settings', title: '设置与存档' };
  refresh();
}

function downloadSave() {
  if (run || ui.screen !== 'safe') return;
  const blob = new Blob([exportMeta()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '撤离区-存档-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已导出存档文件');
  refresh();
}

async function readSaveFile(file) {
  const modal = ui.modal;
  if (!file || run || !modal || modal.kind !== 'settings') return;
  modal.importText = null;
  modal.preview = null;
  modal.error = '';
  modal.restoreConfirm = false;
  if (file.size > 2 * 1024 * 1024) {
    modal.error = '文件过大，请选择撤离区导出的 JSON 存档。';
    refresh();
    return;
  }
  modal.reading = true;
  refresh();
  try {
    const text = await file.text();
    if (ui.modal !== modal || run) return;
    const preview = previewMetaImport(text);
    if (preview.ok) {
      modal.importText = text;
      modal.preview = preview;
    } else modal.error = preview.error || '无法读取此存档。';
  } catch (_) {
    if (ui.modal === modal) modal.error = '文件读取失败，请重新选择。';
  } finally {
    modal.reading = false;
    if (ui.modal === modal) refresh();
  }
}

function applyImportedSave(restore) {
  const modal = ui.modal;
  if (run || ui.screen !== 'safe' || !modal || modal.kind !== 'settings') return;
  if (restore ? !modal.restoreConfirm : !modal.importText || !modal.preview) return;
  const result = restore ? restoreMetaBackup() : importMeta(modal.importText);
  if (!result.ok) {
    modal.error = result.error || '存档未能应用。';
    refresh();
    return;
  }
  ui.loadout = null;
  prepareSafeZone();
  ui.modal = { kind: 'settings', title: '设置与存档' };
  toast(result.persisted ? '存档已应用，配装已更新' : '存档已载入，请导出一份备份');
  refresh();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen();
    else toast('当前浏览器不支持全屏');
  } catch (_) {
    toast('未能切换全屏，可使用浏览器全屏功能');
  }
  refresh();
}

function settingsModal(m) {
  const picker = el('input', {
    type: 'file',
    accept: '.json,application/json',
    id: 'save-import-file',
    class: 'save-file-input',
    disabled: !!m.reading,
    onchange: (e) => readSaveFile(e.target.files[0]),
    'aria-label': '选择要导入的存档文件',
  });
  const preview = m.preview && m.preview.data;
  return [
    el('div', { class: 'modal-title', text: '⚙ 设置与存档' }),
    el('div', { class: 'settings-section' }, [
      el('h2', { text: '显示' }),
      el('p', { text: '横屏游玩，窗口尺寸变化时会自动适配。' }),
      btn(document.fullscreenElement ? '退出全屏' : '进入全屏', 'ghost', toggleFullscreen),
    ]),
    el('div', { class: 'settings-section' }, [
      el('h2', { text: '存档与备份' }),
      el('p', {
        class: saveState.mode === 'ready' ? 'save-status good' : 'save-status bad',
        text: saveState.message || '安全区进度会自动保存在当前浏览器。',
      }),
      el('p', {
        text: `当前：${meta.gold} 金币 · ${meta.stash.length} 张卡牌 · ${meta.stats.raids} 次行动`,
      }),
      el('p', {
        text: '存档保留仓库、金币与成长。进行中的探索不会保存；更换浏览器或设备前可导出备份。',
      }),
      el('div', { class: 'settings-actions' }, [
        btn('导出存档', 'primary', downloadSave),
        btn('立即保存', 'ghost', () => {
          saveMeta();
          refresh();
        }),
        btn(
          '恢复上次备份',
          'ghost',
          () => {
            m.restoreConfirm = true;
            m.preview = null;
            m.importText = null;
            m.error = '';
            refresh();
          },
          { disabled: !saveState.backupAvailable || m.reading },
        ),
      ]),
      el('label', {
        class: 'save-file-label',
        for: 'save-import-file',
        text: m.reading ? '读取存档中…' : '导入存档文件',
      }),
      picker,
      preview
        ? el('div', { class: 'save-preview' }, [
            el('strong', { text: '准备导入' }),
            el('p', {
              text: `${preview.gold} 金币 · ${preview.stash.length} 张卡牌 · ${preview.stats.raids} 次行动`,
            }),
            ...(m.preview.warnings || []).map((message) => el('p', { text: message })),
            el('p', { text: '确认后会替换当前安全区进度，建议先导出当前存档。' }),
            el('div', { class: 'settings-actions' }, [
              btn('确认导入', 'primary', () => applyImportedSave(false)),
              btn('取消导入', 'ghost', () => {
                m.preview = null;
                m.importText = null;
                refresh();
              }),
            ]),
          ])
        : null,
      m.restoreConfirm
        ? el('div', { class: 'save-preview' }, [
            el('p', { text: '将用上次保存的备份替换当前进度，建议先导出当前存档。' }),
            el('div', { class: 'settings-actions' }, [
              btn('确认恢复备份', 'primary', () => applyImportedSave(true)),
              btn('取消恢复', 'ghost', () => {
                m.restoreConfirm = false;
                refresh();
              }),
            ]),
          ])
        : null,
      m.error ? el('p', { class: 'save-error', role: 'alert', text: m.error }) : null,
    ]),
    btn('返回游戏', 'ghost', closeModal),
  ];
}
