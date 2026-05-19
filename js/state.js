const _state = {
  currentUser:   null,
  hastalar:      {},
  tanilar:       {},
  ilaclar:       {},
  alerjiler:     {},
  notlar:        {},
  tetkikler:     {},
  ayarlar:       {},
  activeHastaId: null
};

const _subs = {};

export function getState(key) {
  return key ? _state[key] : { ..._state };
}

export function setState(key, value) {
  _state[key] = value;
  publish(key, value);
}

export function subscribe(event, fn) {
  if (!_subs[event]) _subs[event] = [];
  _subs[event].push(fn);
  return () => {
    _subs[event] = _subs[event].filter(f => f !== fn);
  };
}

export function publish(event, data) {
  (_subs[event] || []).forEach(fn => fn(data));
}
