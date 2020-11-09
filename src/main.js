#!/usr/bin/env node
const acorn = require('acorn');
const walk = require('acorn-walk');
const fs = require('fs');
const path = require('path');
const { generate } = require('astring');

let source;
let savePrefix = 'plotly';

if (process.argv.length < 3) {
  // Read js file from stdin
  const stdinBuffer = fs.readFileSync(0); // STDIN_FILENO = 0
  source = stdinBuffer.toString();
} else {
  // Read filepath from arg
  source = fs.readFileSync(process.argv[2], 'utf8');
  savePrefix = path.basename(process.argv[2], '.ipynb');
}

const cells = JSON.parse(source).cells;
for (let i = 0; i < cells.length; i++) {
  const cell = cells[i];
  if (cell.cell_type === 'code') {
    const outputs = cell.outputs;
    for (let j = 0; j < outputs.length; j++) {
      const output = outputs[j];
      if ('application/vnd.plotly.v1+json' in output.data) {
        // Extract JS code from HTML
        const jsStr = extractPlotly(output.data['text/html']);

        // Parse JS code and get JSON fig data
        const figData = parsePlotly(jsStr);

        // Save to file
        const fileName = savePrefix + '_fig_' + String(i + 1).padStart(3, '0') + '.json';
        fs.writeFileSync(fileName, JSON.stringify(figData));
      }
    }
  }
}

// Extract JavaScript code from HTML lines
function extractPlotly (lines) {
  const html = lines.join('');
  const re = new RegExp('<script type="text/javascript">(.*)</script>', 's');
  return html.match(re)[1];
}

function parsePlotly (source) {
  const parsed = acorn.Parser.parse(source, { ecmaVersion: 2020 });

  // Find node containing fig data
  let target;
  walk.full(
    parsed,
    node => {
      if (node.type === 'IfStatement' && node.test.type === 'CallExpression') {
        target = node.consequent;
      }
    }
  );

  const data = JSON.parse(generate(target.body[0].expression.callee.object.arguments[1]));
  const layout = JSON.parse(generate(target.body[0].expression.callee.object.arguments[2]));

  const output = { data: data, layout: layout };
  return output;
}
