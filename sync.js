const Sync = {
  _queue: null,
  _configured: false,

  _getQueue() {
    if (this._queue) return this._queue;
    try {
      this._queue = JSON.parse(localStorage.getItem('mg_sync_queue') || '[]');
    } catch (e) {
      this._queue = [];
    }
    return this._queue;
  },

  _saveQueue() {
    localStorage.setItem('mg_sync_queue', JSON.stringify(this._queue || []));
  },

  _getStatus() {
    try {
      return JSON.parse(localStorage.getItem('mg_sync_status') || '{"lastSync":null,"pending":0}');
    } catch (e) {
      return { lastSync: null, pending: 0 };
    }
  },

  _saveStatus(status) {
    localStorage.setItem('mg_sync_status', JSON.stringify(status));
  },

  isConfigured() {
    return this._configured;
  },

  enqueue(checkinId) {
    const queue = this._getQueue();
    if (!queue.includes(checkinId)) {
      queue.push(checkinId);
      this._saveQueue();
    }
    if (this._configured) {
      this.syncPending();
    }
  },

  async syncPending() {
    if (!this._configured) return { synced: 0, failed: 0 };
    const queue = this._getQueue();
    const status = this._getStatus();
    status.pending = queue.length;
    this._saveStatus(status);
    return { synced: 0, failed: 0 };
  },

  getStatus() {
    const status = this._getStatus();
    status.pending = this._getQueue().length;
    return status;
  },

  configure() {
    this._configured = false;
  }
};

if (typeof module !== 'undefined') {
  module.exports = Sync;
}
