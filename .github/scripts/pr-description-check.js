const REQUIRED_SECTIONS = [
  { header: '# Description', minLength: 10 },
  { header: '## In Scope', minLength: 10 },
  { header: '## Not in Scope', minLength: 5 },
];

const TEMPLATE_PLACEHOLDERS = [
  'Explain what this PR does and why',
  'Provide a list of changes made in this PR',
  'Provide a list  of changes that would make sense',
  'API contracts, schema changes',
  'Migrations, env vars, feature flags',
  'If this is not a visual change',
  'If this is a visual change',
  'For bugs provide before and after',
];

// Headings from the PR template always end a section. Other headings end it only at the same or a
// higher level, so authors can use subheadings inside a section. Fenced code is skipped, so a "#"
// comment in a code sample isn't read as a heading.
const TEMPLATE_HEADINGS = [
  'Description',
  'Documentation',
  'Changes',
  'In Scope',
  'Not in Scope',
  'Breaking Changes',
  'Deployment Notes',
  'Media',
  'Tests to Run for this PR',
  'Checklist',
  'Author Checklist',
  'Reviewer Checklist',
];

function extractSection(body, header) {
  const level = header.indexOf(' ');
  const lines = body.split(/\r?\n/);
  let fenced = false;
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fenced = !fenced;
    if (fenced) continue;
    const heading = lines[i].match(/^(#{1,6})\s+(.*?)\s*$/);
    if (!heading) continue;
    if (start === -1) {
      if (lines[i].trim() === header) start = i;
    } else if (heading[1].length <= level || TEMPLATE_HEADINGS.includes(heading[2])) {
      end = i;
      break;
    }
  }
  if (start === -1) return null;
  return lines.slice(start + 1, end).join('\n').trim();
}

function isPlaceholder(content) {
  const stripped = content.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!stripped) return true;
  return TEMPLATE_PLACEHOLDERS.some(p => stripped.includes(p));
}

function checkDescription(body) {
  if (!body || !body.trim()) {
    console.error('PR description is empty.');
    process.exit(1);
  }

  const errors = [];

  for (const section of REQUIRED_SECTIONS) {
    const content = extractSection(body, section.header);

    if (content === null) {
      errors.push(`Missing section: "${section.header}"`);
      continue;
    }

    if (isPlaceholder(content)) {
      errors.push(`Section "${section.header}" still contains template placeholder text — fill it in`);
      continue;
    }

    if (content.length < section.minLength) {
      errors.push(`Section "${section.header}" is too short (min ${section.minLength} chars)`);
    }
  }

  if (errors.length > 0) {
    console.error('PR description check failed:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log('PR description is valid.');
}

// The body comes in on stdin, so it never passes through the shell, where backticks in it would run.
function readInput() {
  const arg = process.argv[2];
  if (arg !== undefined && arg !== '-') return Promise.resolve(arg);
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

readInput().then(checkDescription);
