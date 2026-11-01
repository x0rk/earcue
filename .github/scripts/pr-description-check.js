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

function extractSection(body, header, allHeaders) {
  const headerIndex = body.indexOf(header);
  if (headerIndex === -1) return null;

  const contentStart = headerIndex + header.length;
  let contentEnd = body.length;

  for (const other of allHeaders) {
    if (other === header) continue;
    const otherIndex = body.indexOf(other, contentStart);
    if (otherIndex !== -1 && otherIndex < contentEnd) {
      contentEnd = otherIndex;
    }
  }

  return body.slice(contentStart, contentEnd).trim();
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

  const allHeaders = REQUIRED_SECTIONS.map(s => s.header);
  const errors = [];

  for (const section of REQUIRED_SECTIONS) {
    const content = extractSection(body, section.header, allHeaders);

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

const body = process.argv[2];
if (body === undefined) {
  console.error('Usage: node pr-description-check.js "<PR body>"');
  process.exit(1);
}

checkDescription(body);
