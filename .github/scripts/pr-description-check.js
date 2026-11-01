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

// A section is the text under its heading, up to the next heading of any level. Matching whole
// heading lines keeps "# Description" from matching inside "## Description" and the like.
function extractSection(body, header) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
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
