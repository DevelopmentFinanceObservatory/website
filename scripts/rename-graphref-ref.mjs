// Renames `dcid` to `ref` on Search graph references in TS/JSON test files,
// only where the object's key path ends in one of the Search wire paths that
// carry a GraphRef, ProvenanceRef, AmbiguousEntityCandidate or EntityGroup.
// Usage: node rename-graphref.mjs <worktree> [--write] <file>...
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const [root, ...rest] = process.argv.slice(2);
const write = rest.includes('--write');
const files = rest.filter((arg) => arg !== '--write');
const ts = createRequire(path.join(root, 'package.json'))('typescript');

const PATTERNS = [
    'shape.population_type', 'shape.measured_property', 'shape.stat_type',
    'shape.measurement_qualifier', 'shape.measurement_denominator', 'slot_keys.[].property',
    'key.property', 'binding.value.ref', 'binding.values.[].ref', 'binding.set_ref',
    'expansion.added.[]', 'value.ref', 'values.[].ref', 'options.[].value.ref', 'items.[].value.ref', 'entity_groups.*',
    'measure_axis_values.[].value', 'open_axis_facts.[].value', 'open_axis_facts.[].values.[].value',
    'related_group', 'related_measures.[].stat_var', 'source_refs.[]', 'resolved_sources.[]',
    'resolved_entities.[]', 'slot_filters.[].refs.[]', 'named.[]', 'selected.[]', 'scope.place',
    'ambiguous_entities.[].candidates.[]', 'denominator.asked', 'denominator.found',
].map((pattern) => pattern.split('.'));

const nameOf = (name) =>
    ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)
        ? name.text
        : null;

const SKIP = new Set([
    ts.SyntaxKind.ParenthesizedExpression, ts.SyntaxKind.AsExpression,
    ts.SyntaxKind.SatisfiesExpression, ts.SyntaxKind.TypeAssertionExpression,
]);

// The key path down to `node` (an object literal), outermost first; '[]' for
// an array element. Stops at anything that is not an object or array literal.
const pathOf = (node) => {
    const out = [];
    let at = node;
    for (;;) {
        let parent = at.parent;
        while (parent && SKIP.has(parent.kind)) { at = parent; parent = at.parent; }
        if (!parent) break;
        if (ts.isPropertyAssignment(parent) && parent.initializer === at) {
            const key = nameOf(parent.name);
            if (key === null) break;
            out.unshift(key);
            at = parent.parent;
        } else if (ts.isArrayLiteralExpression(parent)) {
            out.unshift('[]');
            at = parent;
        } else break;
    }
    return out;
};

const matches = (keys) =>
    PATTERNS.some((pattern) => {
        if (keys.length < pattern.length) return false;
        const tail = keys.slice(keys.length - pattern.length);
        return pattern.every((seg, i) => seg === '*' ? tail[i] !== '[]' : seg === tail[i]);
    });

let renamed = 0;
let kept = 0;
for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const isJson = file.endsWith('.json');
    const source = ts.createSourceFile(file, isJson ? `(${text})` : text, ts.ScriptTarget.Latest, true);
    const offset = isJson ? 1 : 0;
    const edits = [];
    const visit = (node) => {
        if (ts.isObjectLiteralExpression(node)) {
            const props = node.properties.filter(ts.isPropertyAssignment);
            const dcid = props.find((p) => nameOf(p.name) === 'dcid');
            if (dcid) {
                const keys = pathOf(node);
                const hasRef = props.some((p) => nameOf(p.name) === 'ref');
                if (!hasRef && matches(keys)) {
                    const start = dcid.name.getStart(source) - offset;
                    const end = dcid.name.getEnd() - offset;
                    const old = text.slice(start, end);
                    edits.push([start, end, old.replace('dcid', 'ref')]);
                } else {
                    kept += 1;
                    const { line } = source.getLineAndCharacterOfPosition(dcid.getStart(source));
                    console.log(`kept ${file}:${line + 1} ${keys.join('.') || '(root)'}${hasRef ? ' [has ref]' : ''}`);
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    renamed += edits.length;
    if (edits.length && write) {
        let out = text;
        for (const [start, end, rep] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + rep + out.slice(end);
        fs.writeFileSync(file, out);
    }
    if (edits.length) console.log(`renamed ${edits.length} ${file}`);
}
console.log(`files ${files.length}, renamed ${renamed}, kept ${kept}`);
if (files.length === 0) process.exit(1);
