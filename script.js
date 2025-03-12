(function () {
  const kalu = window.kalu || {};
  window.kalu = kalu;

  // Store for calculation results and their dependencies
  kalu.calculations = {
    results: {}, // Stores the results of each line
    dependencies: {}, // Tracks which lines depend on which other lines
    dependents: {}, // Tracks which lines are dependent on a given line
    lineReferences: {}, // Stores references to lines by their index
    idMapping: {}, // Maps line indices to unique IDs
    idCounter: 0, // Counter for generating unique IDs
    contentToId: {}, // Maps calculation content to IDs for better tracking
    lineHistory: {}, // Tracks line position history for better ID preservation
    referenceLabels: {}, // Stores human-readable labels for references
  };

  // Configuration
  const updateDelay = 100;
  let updateTimer;
  let widgets = [];
  let referenceHighlights = []; // Store reference highlight markers
  let lastContent = ""; // Store the last content for change detection

  // Save content to localStorage with line ID mappings
  kalu.saveContent = function (content) {
    // Save the content and ID mappings
    const saveData = {
      content: content,
      idMapping: kalu.calculations.idMapping,
      idCounter: kalu.calculations.idCounter,
      contentToId: kalu.calculations.contentToId,
      lineHistory: kalu.calculations.lineHistory,
      referenceLabels: kalu.calculations.referenceLabels,
    };
    window.localStorage.kalu = JSON.stringify(saveData);
    lastContent = content;
  };

  // Get last saved content from localStorage
  kalu.getLastSavedContent = function () {
    try {
      const savedData = JSON.parse(window.localStorage.kalu || "{}");

      // Restore ID mappings if available
      if (savedData.idMapping) {
        kalu.calculations.idMapping = savedData.idMapping;
      }

      // Restore ID counter if available
      if (savedData.idCounter) {
        kalu.calculations.idCounter = savedData.idCounter;
      }

      // Restore content to ID mapping if available
      if (savedData.contentToId) {
        kalu.calculations.contentToId = savedData.contentToId;
      }

      // Restore line history if available
      if (savedData.lineHistory) {
        kalu.calculations.lineHistory = savedData.lineHistory;
      }

      // Restore reference labels if available
      if (savedData.referenceLabels) {
        kalu.calculations.referenceLabels = savedData.referenceLabels;
      }

      lastContent = savedData.content || "";
      return savedData.content || "";
    } catch (e) {
      // Fallback for old format
      return window.localStorage.kalu || "";
    }
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

  // Initialize the editor
  kalu.cm = CodeMirror(document.querySelector("#js-cm"), {
    lineNumbers: true,
    theme: "monokai",
    lineWrapping: true,
    autoCloseBrackets: true,
    autofocus: true,
  });

  // Set up change event handler
  kalu.cm.on("change", function (instance, change) {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(function () {
      kalu.updateCalculations();
      kalu.saveContent(instance.getValue());
    }, updateDelay);
  });

  // Initialize the application
  function init() {
    const content = kalu.getLastSavedContent();

    // Load demo content for new users
    if (!content) {
      fetch("./demo.txt")
        .then((res) => res.text())
        .then((content) => {
          kalu.cm.setValue(content);
          kalu.cm.refresh();
          kalu.updateCalculations();
        });
    } else {
      // Load saved content for returning users
      kalu.cm.setValue(content);
      kalu.cm.refresh();
      kalu.updateCalculations();
    }

    // Position cursor at the end
    kalu.cm.setCursor(kalu.cm.lineCount(), 0);

    // Set up event listeners
    document.addEventListener("mouseup", onResultClick);
  }

  // Start the application
  init();
})();
