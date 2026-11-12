if ((location.protocol === 'https:' || location.protocol === 'http:') &&
    'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(error => {
      console.error('オフライン機能の登録に失敗しました。', error);
    });
  });
}
