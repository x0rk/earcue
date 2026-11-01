const ALLOWED_TYPES = [
  'feat', 'fix', 'build', 'chore', 'docs',
  'refactor', 'test', 'style', 'perf', 'ci'
];

const PATTERN = /^(\w+)\(([^)]+)\):\s+(.+)$/;

function checkTitle(title) {
  const match = title.match(PATTERN);

  if (!match) {
    console.error(`PR title does not match required format: <type>(<scope>): <description>`);
    console.error(`  Got: "${title}"`);
    console.error(`  Example: "feat(canvas): add zoom controls"`);
    process.exit(1);
  }

  const [, type, scope, description] = match;

  if (!ALLOWED_TYPES.includes(type)) {
    console.error(`Invalid type "${type}". Allowed types: ${ALLOWED_TYPES.join(', ')}`);
    process.exit(1);
  }

  if (!scope.trim()) {
    console.error(`Scope cannot be empty. Example: feat(canvas): add zoom controls`);
    process.exit(1);
  }

  if (description.length < 5) {
    console.error(`Description too short (min 5 chars). Got: "${description}"`);
    process.exit(1);
  }

  if (description[0] !== description[0].toLowerCase()) {
    console.error(`Description must start lowercase. Got: "${description}"`);
    process.exit(1);
  }

  console.log(`PR title is valid: ${type}(${scope}): ${description}`);
}

const title = process.argv[2];
if (!title) {
  console.error('Usage: node pr-title-check.js "<PR title>"');
  process.exit(1);
}

checkTitle(title);
