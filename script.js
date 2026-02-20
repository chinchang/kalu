(function () {
  const kalu = window.kalu || {};
  window.kalu = kalu;

  // Pages management
  kalu.pages = {
    list: [], // List of all pages
    current: null, // Current active page
    counter: 0, // Counter for generating unique page IDs
  };

  // Store for calculation results and their dependencies
  kalu.calculations = {}; // Will store calculation data for each page

  // ─── Settings ──────────────────────────────────────────
  kalu.accentPresets = {
    green:  { color: "#00d4aa", rgb: "0,212,170" },
    orange: { color: "#f0a050", rgb: "240,160,80" },
    pink:   { color: "#ff6b8a", rgb: "255,107,138" },
    white:  { color: "#c8d3e0", rgb: "200,211,224" },
    yellow: { color: "#f0c674", rgb: "240,198,116" },
  };

  kalu.settings = { accent: "green" };

  kalu.loadSettings = function () {
    try {
      const saved = JSON.parse(localStorage.getItem("kalu_settings") || "{}");
      if (saved.accent && kalu.accentPresets[saved.accent]) {
        kalu.settings.accent = saved.accent;
      }
    } catch (e) {
      // ignore
    }
  };

  kalu.saveSettings = function () {
    localStorage.setItem("kalu_settings", JSON.stringify(kalu.settings));
  };

  kalu.applyAccentColor = function (name) {
    const preset = kalu.accentPresets[name];
    if (!preset) return;

    kalu.settings.accent = name;
    const root = document.documentElement;
    root.style.setProperty("--accent", preset.color);
    root.style.setProperty("--accent-rgb", preset.rgb);

    // Update swatch active state
    const swatches = document.querySelectorAll("#accent-swatches .swatch");
    swatches.forEach(function (sw) {
      sw.classList.toggle("active", sw.dataset.accent === name);
    });

    kalu.saveSettings();
  };

  kalu.initSettings = function () {
    const btn = document.getElementById("settings-btn");
    const pane = document.getElementById("settings-pane");
    const backdrop = document.getElementById("settings-backdrop");
    const closeBtn = document.getElementById("settings-close");
    const swatches = document.querySelectorAll("#accent-swatches .swatch");

    function openSettings() {
      pane.classList.add("open");
      backdrop.classList.add("open");
    }

    function closeSettings() {
      pane.classList.remove("open");
      backdrop.classList.remove("open");
    }

    btn.addEventListener("click", openSettings);
    closeBtn.addEventListener("click", closeSettings);
    backdrop.addEventListener("click", closeSettings);

    swatches.forEach(function (sw) {
      sw.addEventListener("click", function () {
        kalu.applyAccentColor(sw.dataset.accent);
      });
    });

    // Load and apply saved settings
    kalu.loadSettings();
    kalu.applyAccentColor(kalu.settings.accent);
  };

  // Configuration
  const updateDelay = 100;
  let updateTimer;
  let widgets = [];
  let referenceHighlights = []; // Store reference highlight markers
  let lastContent = ""; // Store the last content for change detection

  // Generate a unique ID for a page
  kalu.generatePageId = function () {
    return `page${kalu.pages.counter++}`;
  };

  // Create a new page
  kalu.createPage = function (title = "Untitled") {
    const pageId = kalu.generatePageId();
    const page = {
      id: pageId,
      title: title,
      content: "",
      calculations: {
        results: {}, // Stores the results of each line
        dependencies: {}, // Tracks which lines depend on which other lines
        dependents: {}, // Tracks which lines are dependent on a given line
        lineReferences: {}, // Stores references to lines by their index
        idMapping: {}, // Maps line indices to unique IDs
        idCounter: 0, // Counter for generating unique IDs
        contentToId: {}, // Maps calculation content to IDs for better tracking
        lineHistory: {}, // Tracks line position history for better ID preservation
        referenceLabels: {}, // Stores human-readable labels for references
      },
    };

    kalu.pages.list.push(page);
    kalu.savePagesToLocalStorage();
    return page;
  };

  // Switch to a page
  kalu.switchToPage = function (pageId) {
    // Save current page content if there is an active page
    if (kalu.pages.current) {
      kalu.savePageContent(kalu.pages.current.id, kalu.cm.getValue());
    }

    // Find the page to switch to
    const page = kalu.pages.list.find((p) => p.id === pageId);
    if (!page) return;

    // Update current page
    kalu.pages.current = page;

    // Update the editor content
    kalu.cm.setValue(page.content);
    kalu.cm.refresh();

    // Update calculations
    kalu.calculations = page.calculations;
    kalu.updateCalculations();

    // Update UI
    kalu.updateTabsUI();

    // Save the current page ID to localStorage
    localStorage.setItem("kalu_current_page", pageId);
  };

  // Delete a page
  kalu.deletePage = function (pageId) {
    const pageIndex = kalu.pages.list.findIndex((p) => p.id === pageId);
    if (pageIndex === -1) return;

    // Remove the page
    kalu.pages.list.splice(pageIndex, 1);

    // If we deleted the current page, switch to another page
    if (kalu.pages.current && kalu.pages.current.id === pageId) {
      if (kalu.pages.list.length > 0) {
        kalu.switchToPage(kalu.pages.list[0].id);
      } else {
        // No pages left, create a new one
        const newPage = kalu.createPage();
        kalu.switchToPage(newPage.id);
      }
    }

    // Update UI and save
    kalu.updateTabsUI();
    kalu.savePagesToLocalStorage();
  };

  // Rename a page
  kalu.renamePage = function (pageId, newTitle) {
    const page = kalu.pages.list.find((p) => p.id === pageId);
    if (!page) return;

    page.title = newTitle;
    kalu.updateTabsUI();
    kalu.savePagesToLocalStorage();
  };

  // Save page content
  kalu.savePageContent = function (pageId, content) {
    const page = kalu.pages.list.find((p) => p.id === pageId);
    if (!page) return;

    page.content = content;
    page.calculations = JSON.parse(JSON.stringify(kalu.calculations));
    kalu.savePagesToLocalStorage();
  };

  // Save all pages to localStorage
  kalu.savePagesToLocalStorage = function () {
    const pagesData = {
      list: kalu.pages.list,
      counter: kalu.pages.counter,
    };
    localStorage.setItem("kalu_pages", JSON.stringify(pagesData));
  };

  // Load pages from localStorage
  kalu.loadPagesFromLocalStorage = function () {
    try {
      const pagesData = JSON.parse(localStorage.getItem("kalu_pages") || "{}");

      if (pagesData.list && pagesData.list.length > 0) {
        kalu.pages.list = pagesData.list;
        kalu.pages.counter = pagesData.counter || 0;

        // Get the last active page
        const lastPageId = localStorage.getItem("kalu_current_page");
        const lastPage = lastPageId
          ? kalu.pages.list.find((p) => p.id === lastPageId)
          : null;

        // Switch to the last active page or the first page
        if (lastPage) {
          kalu.switchToPage(lastPage.id);
        } else {
          kalu.switchToPage(kalu.pages.list[0].id);
        }
      } else {
        // No pages found, create a default page
        const defaultPage = kalu.createPage("Default");
        kalu.switchToPage(defaultPage.id);
      }
    } catch (e) {
      console.error("Error loading pages from localStorage:", e);
      // Create a default page if loading fails
      const defaultPage = kalu.createPage("Default");
      kalu.switchToPage(defaultPage.id);
    }
  };

  // Update the tabs UI
  kalu.updateTabsUI = function () {
    const tabsContainer = document.getElementById("tabs-container");
    if (!tabsContainer) return;

    // Clear existing tabs
    tabsContainer.innerHTML = "";

    // Create tabs for each page
    kalu.pages.list.forEach((page) => {
      const tab = document.createElement("div");
      tab.className = "tab";
      if (kalu.pages.current && kalu.pages.current.id === page.id) {
        tab.classList.add("active");
      }

      // Tab title
      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = page.title;
      title.addEventListener("dblclick", function () {
        const newTitle = prompt("Enter new page title:", page.title);
        if (newTitle && newTitle.trim() !== "") {
          kalu.renamePage(page.id, newTitle.trim());
        }
      });
      tab.appendChild(title);

      // Close button
      const closeBtn = document.createElement("span");
      closeBtn.className = "tab-close";
      closeBtn.innerHTML = "&times;";
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (
          confirm(`Are you sure you want to delete the page "${page.title}"?`)
        ) {
          kalu.deletePage(page.id);
        }
      });
      tab.appendChild(closeBtn);

      // Tab click event
      tab.addEventListener("click", function () {
        kalu.switchToPage(page.id);
      });

      tabsContainer.appendChild(tab);
    });

    // Add "New Page" button
    const newPageBtn = document.createElement("div");
    newPageBtn.className = "new-page-btn";
    newPageBtn.innerHTML = "+";
    newPageBtn.title = "Create a new page";
    newPageBtn.addEventListener("click", function () {
      const title = prompt("Enter page title:", "Untitled");
      if (title) {
        const newPage = kalu.createPage(title.trim() || "Untitled");
        kalu.switchToPage(newPage.id);
      }
    });
    tabsContainer.appendChild(newPageBtn);
  };

  // Generate a unique ID for a calculation
  kalu.generateUniqueId = function () {
    return `calc${kalu.calculations.idCounter++}`;
  };

  // Generate a reference name for a calculation
  kalu.generateReference = function (id) {
    return `_${id}`;
  };

  // Generate a human-readable label for a calculation
  kalu.generateReferenceLabel = function (line, result) {
    // Create a short preview of the calculation
    let preview = line.trim();

    // Truncate if too long
    if (preview.length > 20) {
      preview = preview.substring(0, 17) + "...";
    }

    // Add the result
    let resultStr = result + "";
    if (resultStr.length > 10) {
      resultStr = resultStr.substring(0, 7) + "...";
    }

    return `${preview} = ${resultStr}`;
  };

  // Parse a line to extract variable assignments
  kalu.parseVariableAssignment = function (line) {
    const assignmentMatch = line.match(
      /^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(.+)$/
    );
    if (assignmentMatch) {
      return {
        variable: assignmentMatch[1],
        expression: assignmentMatch[2],
      };
    }
    return null;
  };

  // Find all calculation references in an expression
  kalu.findCalcReferences = function (expr) {
    // Match reference patterns like _calc0, _calc1, etc.
    const refRegex = /_calc(\d+)/g;
    const matches = [];
    let match;

    while ((match = refRegex.exec(expr)) !== null) {
      matches.push({
        ref: match[0],
        id: `calc${match[1]}`,
        index: match.index,
      });
    }

    return matches;
  };

  // Find all variable references in an expression
  kalu.findVariableReferences = function (expr) {
    // Match variable names that aren't part of longer names
    const variableRegex =
      /(?<![a-zA-Z0-9_])([a-zA-Z][a-zA-Z0-9_]*)(?![a-zA-Z0-9_])/g;
    const matches = expr.match(variableRegex) || [];

    // Filter out common math functions and constants that might be matched
    const mathFunctions = [
      "sin",
      "cos",
      "tan",
      "log",
      "exp",
      "sqrt",
      "abs",
      "ceil",
      "floor",
      "round",
      "max",
      "min",
    ];
    const mathConstants = ["pi", "e"];

    return matches.filter(
      (match) =>
        !mathFunctions.includes(match) &&
        !mathConstants.includes(match) &&
        !match.startsWith("_") // Exclude calculation references
    );
  };

  // Find line index by ID
  kalu.findLineIndexById = function (id) {
    for (const lineIndex in kalu.calculations.idMapping) {
      if (kalu.calculations.idMapping[lineIndex] === id) {
        return parseInt(lineIndex);
      }
    }
    return -1;
  };

  // Normalize calculation content for consistent matching
  kalu.normalizeContent = function (content) {
    return content.trim().replace(/\s+/g, " ");
  };

  // Detect which lines have changed between two content versions
  kalu.detectChangedLines = function (oldContent, newContent) {
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");

    const changes = {
      added: [],
      removed: [],
      modified: [],
      unchanged: [],
    };

    // Use a diff algorithm to detect changes
    // For simplicity, we'll use a basic line-by-line comparison
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < oldLines.length ? oldLines[i].trim() : null;
      const newLine = i < newLines.length ? newLines[i].trim() : null;

      if (oldLine === null) {
        // Line was added
        changes.added.push(i);
      } else if (newLine === null) {
        // Line was removed
        changes.removed.push(i);
      } else if (oldLine !== newLine) {
        // Line was modified
        changes.modified.push(i);
      } else {
        // Line is unchanged
        changes.unchanged.push(i);
      }
    }

    return changes;
  };

  // Clear all reference highlights
  kalu.clearReferenceHighlights = function () {
    referenceHighlights.forEach((marker) => marker.clear());
    referenceHighlights = [];
  };

  // Highlight a reference in the editor
  kalu.highlightReference = function (lineIndex, start, end, referenceId) {
    // Find the target line that this reference points to
    const targetLineIndex = kalu.findLineIndexById(referenceId);
    if (targetLineIndex === -1) return;

    // Get the label for this reference
    const label =
      kalu.calculations.referenceLabels[referenceId] || "Unknown reference";

    // Create a marker element
    const marker = document.createElement("span");
    marker.className = "reference-highlight";
    marker.title = label;
    marker.dataset.targetLine = targetLineIndex;
    marker.addEventListener("mouseover", function () {
      // Highlight the target line when hovering over the reference
      kalu.cm.addLineClass(targetLineIndex, "background", "highlighted-line");
    });
    marker.addEventListener("mouseout", function () {
      // Remove highlight when mouse leaves
      kalu.cm.removeLineClass(
        targetLineIndex,
        "background",
        "highlighted-line"
      );
    });
    marker.addEventListener("click", function (e) {
      // Prevent the default click behavior
      e.stopPropagation();

      // Scroll to the target line
      kalu.cm.scrollIntoView({ line: targetLineIndex, ch: 0 }, 100);

      // Briefly highlight the target line more prominently
      kalu.cm.addLineClass(
        targetLineIndex,
        "background",
        "target-line-highlight"
      );
      setTimeout(function () {
        kalu.cm.removeLineClass(
          targetLineIndex,
          "background",
          "target-line-highlight"
        );
      }, 1500);
    });

    // Add the marker to the editor
    const highlightMarker = kalu.cm.markText(
      { line: lineIndex, ch: start },
      { line: lineIndex, ch: end },
      {
        replacedWith: marker,
        handleMouseEvents: true,
      }
    );

    referenceHighlights.push(highlightMarker);
  };

  // Update calculation results and dependencies
  kalu.updateCalculations = function () {
    if (!kalu.pages.current) return;

    const content = kalu.cm.getValue();
    const lines = content.split("\n");
    const oldResults = { ...kalu.calculations.results };
    const oldIdMapping = { ...kalu.calculations.idMapping };
    const oldContentToId = { ...kalu.calculations.contentToId };
    const oldLineHistory = { ...kalu.calculations.lineHistory };
    const oldReferenceLabels = { ...kalu.calculations.referenceLabels };

    // Clear existing reference highlights
    kalu.clearReferenceHighlights();

    // Detect changes between last content and current content
    const changes = kalu.detectChangedLines(lastContent, content);

    // Reset dependencies and dependents
    kalu.calculations.dependencies = {};
    kalu.calculations.dependents = {};
    kalu.calculations.lineReferences = {};

    // Create a new ID mapping while preserving existing IDs
    const newIdMapping = {};
    const newContentToId = {};
    const newLineHistory = {};
    const newReferenceLabels = {};

    // First pass: assign IDs to lines and collect variable assignments
    const variables = {};
    lines.forEach((line, lineIndex) => {
      if (line.trim() === "" || line.match(/^\s*\/\//)) {
        // Skip empty lines and comments
        return;
      }

      // Normalize the line content for better matching
      const normalizedContent = kalu.normalizeContent(line);

      // Assign or preserve ID for this line
      let id;

      // Strategy for ID assignment:
      // 1. If line is unchanged, keep its ID
      // 2. If line is modified, try to keep its ID if possible
      // 3. If line is new, check if similar content existed before
      // 4. Otherwise, generate a new ID

      if (changes.unchanged.includes(lineIndex) && oldIdMapping[lineIndex]) {
        // Unchanged line - keep its ID
        id = oldIdMapping[lineIndex];
      } else if (
        changes.modified.includes(lineIndex) &&
        oldIdMapping[lineIndex]
      ) {
        // Modified line - keep its ID to preserve references
        id = oldIdMapping[lineIndex];

        // Update the content-to-ID mapping
        if (
          oldContentToId[normalizedContent] &&
          oldContentToId[normalizedContent] !== id
        ) {
          // This content already had a different ID - decide which to keep
          // For now, prioritize keeping the line position's ID to preserve references
        }
      } else if (oldContentToId[normalizedContent]) {
        // Content existed before - reuse its ID
        id = oldContentToId[normalizedContent];
      } else if (oldLineHistory[lineIndex]) {
        // Check if this line position had an ID before
        id = oldLineHistory[lineIndex];
      } else {
        // Generate a new ID
        id = kalu.generateUniqueId();
      }

      // Store the mappings
      newIdMapping[lineIndex] = id;
      newContentToId[normalizedContent] = id;
      newLineHistory[lineIndex] = id;
      kalu.calculations.lineReferences[lineIndex] = kalu.generateReference(id);

      // Collect variable assignments
      const assignment = kalu.parseVariableAssignment(line);
      if (assignment) {
        variables[assignment.variable] = lineIndex;
      }
    });

    // Update the ID mappings
    kalu.calculations.idMapping = newIdMapping;
    kalu.calculations.contentToId = newContentToId;
    kalu.calculations.lineHistory = newLineHistory;

    // Expose variables for autocomplete
    kalu.currentVariables = variables;

    // Second pass: evaluate expressions and build dependency graph
    lines.forEach((line, lineIndex) => {
      if (line.trim() === "" || line.match(/^\s*\/\//)) {
        // Skip empty lines and comments
        kalu.calculations.results[lineIndex] = "";
        return;
      }

      // Find variable references in this line
      const varRefs = kalu.findVariableReferences(line);

      // Find calculation references in this line
      const calcRefs = kalu.findCalcReferences(line);

      // Record dependencies
      kalu.calculations.dependencies[lineIndex] = [];

      // Add variable dependencies
      varRefs.forEach((ref) => {
        if (variables[ref] !== undefined && variables[ref] !== lineIndex) {
          kalu.calculations.dependencies[lineIndex].push(variables[ref]);

          // Record dependents
          if (!kalu.calculations.dependents[variables[ref]]) {
            kalu.calculations.dependents[variables[ref]] = [];
          }
          if (
            !kalu.calculations.dependents[variables[ref]].includes(lineIndex)
          ) {
            kalu.calculations.dependents[variables[ref]].push(lineIndex);
          }
        }
      });

      // Add calculation reference dependencies
      calcRefs.forEach((ref) => {
        const depLineIndex = kalu.findLineIndexById(ref.id);
        if (depLineIndex !== -1 && depLineIndex !== lineIndex) {
          kalu.calculations.dependencies[lineIndex].push(depLineIndex);

          // Record dependents
          if (!kalu.calculations.dependents[depLineIndex]) {
            kalu.calculations.dependents[depLineIndex] = [];
          }
          if (!kalu.calculations.dependents[depLineIndex].includes(lineIndex)) {
            kalu.calculations.dependents[depLineIndex].push(lineIndex);
          }
        }
      });

      // Try to evaluate the expression
      try {
        // Create a scope with all the variables and calculation references
        const scope = {};

        // Add variables to scope
        Object.keys(variables).forEach((varName) => {
          const varLineIndex = variables[varName];
          if (kalu.calculations.results[varLineIndex] !== undefined) {
            scope[varName] = kalu.calculations.results[varLineIndex];
          }
        });

        // Add calculation references to scope
        Object.keys(kalu.calculations.idMapping).forEach((lineIdx) => {
          const id = kalu.calculations.idMapping[lineIdx];
          const refName = kalu.generateReference(id);
          const idx = parseInt(lineIdx);
          if (kalu.calculations.results[idx] !== undefined) {
            scope[refName] = kalu.calculations.results[idx];
          }
        });

        // Evaluate the expression
        let result;
        const assignment = kalu.parseVariableAssignment(line);
        if (assignment) {
          // For variable assignments, evaluate the right side
          result = math.evaluate(assignment.expression, scope);
          // Store the result for the variable
          scope[assignment.variable] = result;
        } else {
          // For regular expressions, evaluate the whole line
          result = math.evaluate(line, scope);
        }

        // Store the result
        kalu.calculations.results[lineIndex] = result;

        // Generate and store a reference label for this calculation
        const id = kalu.calculations.idMapping[lineIndex];
        if (id) {
          newReferenceLabels[id] = kalu.generateReferenceLabel(line, result);
        }

        // Highlight calculation references in this line
        calcRefs.forEach((ref) => {
          kalu.highlightReference(
            lineIndex,
            ref.index,
            ref.index + ref.ref.length,
            ref.id
          );
        });
      } catch (e) {
        // If evaluation fails, store the error
        kalu.calculations.results[lineIndex] = "...";
      }
    });

    // Update reference labels
    kalu.calculations.referenceLabels = newReferenceLabels;

    // Check if any results have changed and update dependents recursively
    const changedLines = [];
    Object.keys(kalu.calculations.results).forEach((lineIndex) => {
      lineIndex = parseInt(lineIndex);
      if (oldResults[lineIndex] !== kalu.calculations.results[lineIndex]) {
        changedLines.push(lineIndex);
      }
    });

    // Recursively update dependent lines
    const processedLines = new Set();
    const updateDependents = (lineIndex) => {
      if (processedLines.has(lineIndex)) return;
      processedLines.add(lineIndex);

      const dependents = kalu.calculations.dependents[lineIndex] || [];
      dependents.forEach((dependentLine) => {
        // Re-evaluate the dependent line
        try {
          const line = lines[dependentLine];

          // Create a scope with all the variables and calculation references
          const scope = {};

          // Add variables to scope
          Object.keys(variables).forEach((varName) => {
            const varLineIndex = variables[varName];
            if (kalu.calculations.results[varLineIndex] !== undefined) {
              scope[varName] = kalu.calculations.results[varLineIndex];
            }
          });

          // Add calculation references to scope
          Object.keys(kalu.calculations.idMapping).forEach((lineIdx) => {
            const id = kalu.calculations.idMapping[lineIdx];
            const refName = kalu.generateReference(id);
            const idx = parseInt(lineIdx);
            if (kalu.calculations.results[idx] !== undefined) {
              scope[refName] = kalu.calculations.results[idx];
            }
          });

          // Evaluate the expression
          let result;
          const assignment = kalu.parseVariableAssignment(line);
          if (assignment) {
            result = math.evaluate(assignment.expression, scope);
            scope[assignment.variable] = result;
          } else {
            result = math.evaluate(line, scope);
          }

          // Store the result
          kalu.calculations.results[dependentLine] = result;

          // Update the reference label for this calculation
          const id = kalu.calculations.idMapping[dependentLine];
          if (id) {
            newReferenceLabels[id] = kalu.generateReferenceLabel(line, result);
          }

          // Continue updating dependents
          updateDependents(dependentLine);
        } catch (e) {
          kalu.calculations.results[dependentLine] = "...";
        }
      });
    };

    // Update all dependents of changed lines
    changedLines.forEach(updateDependents);

    // Find and highlight all calculation references again after updates
    lines.forEach((line, lineIndex) => {
      if (line.trim() === "" || line.match(/^\s*\/\//)) {
        return; // Skip empty lines and comments
      }

      const calcRefs = kalu.findCalcReferences(line);
      calcRefs.forEach((ref) => {
        kalu.highlightReference(
          lineIndex,
          ref.index,
          ref.index + ref.ref.length,
          ref.id
        );
      });
    });

    // Update the UI
    kalu.updateUI();

    // Save the current page content
    if (kalu.pages.current) {
      kalu.savePageContent(kalu.pages.current.id, content);
    }

    lastContent = content;
  };

  // Update the UI with calculation results
  kalu.updateUI = function () {
    // Clear existing widgets
    widgets.forEach((node) => node.remove());
    widgets = [];

    // Add result widgets for each line
    const content = kalu.cm.getValue();
    const lines = content.split("\n");

    lines.forEach((line, lineIndex) => {
      if (line.trim() === "" || line.match(/^\s*\/\//)) {
        // Skip empty lines and comments
        return;
      }

      const result = kalu.calculations.results[lineIndex];
      if (result !== undefined && result !== "") {
        let displayResult = result + "";

        // Truncate long results
        if (displayResult.length > 40) {
          displayResult = displayResult.substring(0, 37) + "...";
        }

        // Create and add the widget
        const node = document.createElement("div");
        node.classList.add("result");
        node.textContent = displayResult;
        node.dataset.lineIndex = lineIndex;
        node.dataset.value = result;
        node.dataset.reference = kalu.calculations.lineReferences[lineIndex];
        node.dataset.id = kalu.calculations.idMapping[lineIndex];

        // Add tooltip showing what this result can be referenced as
        const id = kalu.calculations.idMapping[lineIndex];
        if (id) {
          node.title = `Reference this as: ${kalu.calculations.lineReferences[lineIndex]}`;
        }

        kalu.cm.addWidget({ line: lineIndex, ch: line.length }, node);
        widgets.push(node);
      }
    });
  };

  // Handle clicking on a result to insert it
  function onResultClick(e) {
    if (!e.target.classList.contains("result")) {
      return;
    }

    // Insert the calculation reference instead of the raw value
    const reference = e.target.dataset.reference;
    const selections = kalu.cm.listSelections();

    selections.forEach(function (selection) {
      kalu.cm.replaceRange(reference, selection.anchor, selection.head);
    });

    kalu.cm.focus();
  }

  // ─── Autocomplete hint function ─────────────────────
  function kaluHint(cm) {
    var cur = cm.getCursor();
    var line = cm.getLine(cur.line);

    // Find the word being typed
    var end = cur.ch, start = end;
    while (start && /[\w]/.test(line.charAt(start - 1))) --start;
    var typed = line.slice(start, end).toLowerCase();

    if (!typed) return;

    var completions = [];
    var vars = kalu.currentVariables || {};

    // Collect named variables (skip the one being defined on the current line)
    Object.keys(vars).forEach(function (name) {
      var lineIdx = vars[name];
      if (lineIdx === cur.line) return;
      if (name.toLowerCase().indexOf(typed) !== 0) return;

      var val = kalu.calculations.results[lineIdx];
      var displayVal = val !== undefined && val !== "" ? " = " + val : "";

      completions.push({
        text: name,
        displayText: name + displayVal,
        render: function (li, data, completion) {
          var nameSpan = document.createElement("span");
          nameSpan.textContent = completion.text;
          li.appendChild(nameSpan);
          if (displayVal) {
            var valSpan = document.createElement("span");
            valSpan.className = "hint-value";
            valSpan.textContent = displayVal;
            li.appendChild(valSpan);
          }
        },
      });
    });

    if (!completions.length) return;

    return {
      list: completions,
      from: CodeMirror.Pos(cur.line, start),
      to: CodeMirror.Pos(cur.line, end),
    };
  }

  // Initialize the application
  function init() {
    // Create tabs container inside app-shell, before the editor
    const tabsContainer = document.createElement("div");
    tabsContainer.id = "tabs-container";
    const cmEl = document.getElementById("js-cm");
    cmEl.parentNode.insertBefore(tabsContainer, cmEl);

    // Initialize the editor
    kalu.cm = CodeMirror(document.querySelector("#js-cm"), {
      lineNumbers: true,
      theme: "kalu-dark",
      lineWrapping: true,
      autoCloseBrackets: true,
      autofocus: true,
      cursorBlinkRate: 0,
    });

    // Set up change event handler
    kalu.cm.on("change", function (instance, change) {
      clearTimeout(updateTimer);
      updateTimer = setTimeout(function () {
        kalu.updateCalculations();
      }, updateDelay);
    });

    // Auto-trigger autocomplete when typing letters or underscore
    kalu.cm.on("inputRead", function (cm, change) {
      if (change.text[0] && /[a-zA-Z_]/.test(change.text[0])) {
        cm.showHint({ hint: kaluHint, completeSingle: false });
      }
    });

    // Initialize settings panel
    kalu.initSettings();

    // Load pages from localStorage or create default page
    kalu.loadPagesFromLocalStorage();

    // Set up event listeners
    document.addEventListener("mouseup", onResultClick);

    // Update tabs UI
    kalu.updateTabsUI();
  }

  // Start the application
  init();
})();
