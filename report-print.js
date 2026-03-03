(function () {
  function triggerPrint() {
    window.focus();
    setTimeout(function () {
      window.print();
    }, 100);
  }

  function init() {
    var printButton = document.getElementById('printPdfBtn');
    if (printButton) {
      printButton.addEventListener('click', triggerPrint);
    }

    document.addEventListener('keydown', function (event) {
      var key = event.key ? event.key.toLowerCase() : '';
      if ((event.ctrlKey || event.metaKey) && key === 'p') {
        event.preventDefault();
        triggerPrint();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
