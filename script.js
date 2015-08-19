;(function () {

	editur = window.editur || {};

	var updateTimer,
		updateDelay = 100,
		widgets = [];
		frame = document.querySelector('#demo-frame');

	// editur.demoFrameDocument = frame.contentDocument || frame.contentWindow.document;

	window.onunload = function () {
		editur.saveContent(editur.cm.getValue());
	};

	editur.saveContent = function (content) {
		window.localStorage.kalu = content;
	};

	editur.getLastSavedContent = function () {
		return window.localStorage.kalu || '';
	};

	editur.setPreviewContent = function (content) {
		var self = this;

		var r1 = /(\d+.*)\n/g;
			r2 = /(?:Math\.|[\d\(]).*$/gm;
		var searches = editur.cm.getSearchCursor(r2),
			match,
			expr,
			result,
			node;

		widgets.forEach(function (node) {
			node.remove();
		});

		while (match = searches.findNext()) {
			expr = match[0]
			expr = expr.replace(/=\s*$/, '');
			try {
				result = eval(expr);
			} catch (e) {
				result = '...';
			}
			node = document.createElement('div');
			node.classList.add('result');
			node.textContent = result;
			editur.cm.addWidget(searches.to(), node);
			widgets.push(node);
		}
	};

	function onResultClick(e) {
		if (!e.target.classList.contains('result')) { return; }

		var value = e.target.textContent,
			selections = editur.cm.listSelections();

		selections.forEach(function (selection) {
			editur.cm.replaceRange(value, selection.anchor, selection.head);
		});

		editur.cm.focus();
	}

	editur.cm = CodeMirror(document.querySelector('#js-cm'), {
		lineNumbers: true,
		mode:  'javascript',
		theme: 'monokai',
		lineWrapping: true,
		autoCloseBrackets: true,
		autofocus: true
	});

	editur.cm.on('change', function (instance, change) {
		clearTimeout(updateTimer);
		updateTimer = setTimeout(function () {
			editur.setPreviewContent(instance.getValue());
		}, updateDelay);
	});

	function init () {
		var content = editur.getLastSavedContent();

		// load demo content for new user
		if (!content) {
			var reqListener = function (content) {
				content = content || this.responseText;
				editur.cm.setValue(content);
				editur.cm.refresh();
				editur.setPreviewContent(content);
			};

			var oReq = new XMLHttpRequest();
			oReq.onload = reqListener;
			oReq.open('get', 'demo.html', true);
			// oReq.send();

			reqListener("2 + 3\n\n/**\n - Simply keep writing your calculations in JavaScript.\n \n - You can click/tap any result [yellow block] \n   to use in your current calculation.\n**/\n\n");
		}
		// load saved content for returning user
		else {
			editur.setPreviewContent(content);
			editur.cm.setValue(content);
			editur.cm.refresh();
		}
		// Position cursor to end
		editur.cm.setCursor(editur.cm.lineCount(), 0);

		document.addEventListener('mouseup', onResultClick);
	}

	init();

})();