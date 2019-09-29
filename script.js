(function() {
  editur = window.editur || {};

  var updateTimer,
    updateDelay = 100,
    widgets = [];
  frame = document.querySelector("#demo-frame");

  // editur.demoFrameDocument = frame.contentDocument || frame.contentWindow.document;

  window.onunload = function() {
    editur.saveContent(editur.cm.getValue());
  };

  editur.saveContent = function(content) {
    window.localStorage.kalu = content;
  };

  editur.getLastSavedContent = function() {
    return window.localStorage.kalu || "";
  };

  editur.setPreviewContent = function(content) {
    var self = this;

    var r1 = /(\d+.*)\n/g;
    r2 = /.*$/gm;
    var searches = editur.cm.getSearchCursor(r2),
      match,
      expr,
      result,
      node;

    widgets.forEach(function(node) {
      node.remove();
    });

    while ((match = searches.findNext())) {
      expr = match[0];
      expr = expr.replace(/=\s*$/, "");
      if (expr.match(/\/(\*|\/)\*?/)) {
        continue;
      }
      try {
        result = math.evaluate(expr) + "";
      } catch (e) {
        result = "...";
      }
      if (result.length > 40) {
        result = "";
      }
      node = document.createElement("div");
      node.classList.add("result");
      node.textContent = result;
      editur.cm.addWidget(searches.to(), node);
      widgets.push(node);
    }
  };

  function onResultClick(e) {
    if (!e.target.classList.contains("result")) {
      return;
    }

    var value = e.target.textContent,
      selections = editur.cm.listSelections();

    selections.forEach(function(selection) {
      editur.cm.replaceRange(value, selection.anchor, selection.head);
    });

    editur.cm.focus();
  }

  editur.cm = CodeMirror(document.querySelector("#js-cm"), {
    lineNumbers: true,
    theme: "monokai",
    lineWrapping: true,
    autoCloseBrackets: true,
    autofocus: true
  });

  editur.cm.on("change", function(instance, change) {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(function() {
      editur.setPreviewContent(instance.getValue());
    }, updateDelay);
  });

  function init() {
    var content = editur.getLastSavedContent();

    // load demo content for new user
    if (!content) {
      var reqListener = function(content) {
        editur.cm.setValue(content);
        editur.cm.refresh();
        editur.setPreviewContent(content);
      };

      fetch("./demo.txt")
        .then(res => res.text())
        .then(reqListener);
    }
    // load saved content for returning user
    else {
      editur.setPreviewContent(content);
      editur.cm.setValue(content);
      editur.cm.refresh();
    }
    // Position cursor to end
    editur.cm.setCursor(editur.cm.lineCount(), 0);

    document.addEventListener("mouseup", onResultClick);
  }

  init();
})();
