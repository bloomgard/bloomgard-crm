const MAX_LEVELS = 5;
const TOTAL_COLS = MAX_LEVELS * 3;

function renderRow(depth, contentCells) {
  const leftSpacers = depth * 3;
  // contentCells is an array of objects { colspan: 1, content: '...' }
  const contentColsUsed = contentCells.reduce((sum, c) => sum + (c.colspan || 1), 0);
  const rightSpacers = TOTAL_COLS - leftSpacers - contentColsUsed;
  
  let html = '<tr>\n';
  for(let i=0; i<leftSpacers; i++) html += '  <td></td>\n';
  
  contentCells.forEach(c => {
    html += `  <td colspan="${c.colspan || 1}">${c.content}</td>\n`;
  });
  
  for(let i=0; i<rightSpacers; i++) html += '  <td></td>\n';
  html += '</tr>\n';
  return html;
}

console.log(renderRow(1, [
  { content: 'Key 1' },
  { content: 'Value 1' },
  { content: '+' }
]));
console.log(renderRow(1, [
  { colspan: 2, content: 'Sibling +' },
  { content: '' }
]));
