import { dirname, join, relative, resolve } from 'node:path';

import ts from 'typescript';

/**
 * The state classes of the app's components: for each class a component
 * always applies, the classes it adds to the same element on a condition,
 * read from the `classNames(…)` calls in the component's source. A
 * condition reads `cond && styles.x`, `cond ? styles.x : styles.y` or
 * `{ [styles.x]: cond }`; the rest of the call's `styles.*` arguments are
 * the element's own classes. Class names come out as the bundle hashed
 * them, from the class map of each SCSS module (`styles`, by repo path).
 */

export type Source = { path: string; text: string };

/** Class maps of the bundle's SCSS modules, by path from the repo root. */
export type StyleModules = Record<string, Record<string, string>>;

/** Each own class mapped to the state classes that toggle beside it. */
export type StateClasses = Record<string, string[]>;

const modulePath = (specifier: string, from: string, repo: string): string =>
    relative(
        repo,
        specifier.startsWith('@/')
            ? join(repo, 'src', specifier.slice(2))
            : resolve(repo, dirname(from), specifier),
    );

const parse = ({ path, text }: Source): ts.SourceFile =>
    ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// The local names of a source's `classnames` import and of each SCSS module
// it imports, with the module's class map, and the modules without a map.
const readImports = (
    source: Source,
    styles: StyleModules,
    repo: string,
): {
    file: ts.SourceFile;
    joiners: Set<string>;
    modules: Map<string, Record<string, string>>;
    unmapped: string[];
} => {
    const file = parse(source);
    const joiners = new Set<string>();
    const modules = new Map<string, Record<string, string>>();
    const unmapped: string[] = [];

    for (const statement of file.statements) {
        const name = ts.isImportDeclaration(statement) && statement.importClause?.name?.text;

        if (!name || !ts.isStringLiteral(statement.moduleSpecifier)) {
            continue;
        }

        const specifier = statement.moduleSpecifier.text;

        if (specifier === 'classnames') {
            joiners.add(name);
        } else if (specifier.endsWith('.module.scss')) {
            const map = styles[modulePath(specifier, source.path, repo)];

            if (map) {
                modules.set(name, map);
            } else {
                unmapped.push(specifier);
            }
        }
    }

    return { file, joiners, modules, unmapped };
};

export const stateClasses = (
    sources: Source[],
    styles: StyleModules,
    repo: string,
): StateClasses => {
    const found = new Map<string, Set<string>>();

    for (const { path, text } of sources) {
        const { file, joiners, modules } = readImports({ path, text }, styles, repo);

        if (!joiners.size || !modules.size) {
            continue;
        }

        const className = (node: ts.Expression): string | undefined => {
            if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
                return modules.get(node.expression.text)?.[node.name.text];
            }

            if (
                ts.isElementAccessExpression(node) &&
                ts.isIdentifier(node.expression) &&
                ts.isStringLiteral(node.argumentExpression)
            ) {
                return modules.get(node.expression.text)?.[node.argumentExpression.text];
            }

            return undefined;
        };

        const read = (
            node: ts.Expression,
            conditional: boolean,
            own: string[],
            states: string[],
        ) => {
            const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
            const name = className(inner);

            if (name) {
                (conditional ? states : own).push(name);
            } else if (ts.isBinaryExpression(inner)) {
                const operator = inner.operatorToken.kind;

                if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
                    read(inner.right, true, own, states);
                } else if (
                    operator === ts.SyntaxKind.BarBarToken ||
                    operator === ts.SyntaxKind.QuestionQuestionToken
                ) {
                    read(inner.left, true, own, states);
                    read(inner.right, true, own, states);
                }
            } else if (ts.isConditionalExpression(inner)) {
                read(inner.whenTrue, true, own, states);
                read(inner.whenFalse, true, own, states);
            } else if (ts.isObjectLiteralExpression(inner)) {
                for (const property of inner.properties) {
                    if (
                        ts.isPropertyAssignment(property) &&
                        ts.isComputedPropertyName(property.name)
                    ) {
                        read(property.name.expression, true, own, states);
                    }
                }
            }
        };

        const visit = (node: ts.Node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isIdentifier(node.expression) &&
                joiners.has(node.expression.text)
            ) {
                const own: string[] = [];
                const states: string[] = [];

                for (const argument of node.arguments) {
                    read(argument, false, own, states);
                }

                for (const base of own) {
                    const set = found.get(base) ?? new Set();

                    states.forEach((state) => set.add(state));
                    found.set(base, set);
                }
            }

            ts.forEachChild(node, visit);
        };

        visit(file);
    }

    return Object.fromEntries(
        [...found].filter(([, set]) => set.size).map(([base, set]) => [base, [...set].toSorted()]),
    );
};

/**
 * Every class a source reads from an SCSS module it imports, as
 * `styles.name` or `styles['name']`, that the module's class map lacks, listed
 * as `path: styles.name` and sorted. Such a read is `undefined` at run time,
 * so the element it names carries no class. An imported module without a
 * class map is listed as `path: specifier`, since its reads go unchecked.
 */
export const missingClasses = (sources: Source[], styles: StyleModules, repo: string): string[] => {
    const missing = new Set<string>();

    for (const source of sources) {
        const { file, modules, unmapped } = readImports(source, styles, repo);

        unmapped.forEach((specifier) => missing.add(`${source.path}: ${specifier}`));

        const visit = (node: ts.Node) => {
            const read = ts.isPropertyAccessExpression(node)
                ? { object: node.expression, key: node.name.text }
                : ts.isElementAccessExpression(node) &&
                    ts.isStringLiteralLike(node.argumentExpression)
                  ? { object: node.expression, key: node.argumentExpression.text }
                  : null;

            if (read && ts.isIdentifier(read.object)) {
                const map = modules.get(read.object.text);

                if (map && !Object.hasOwn(map, read.key)) {
                    missing.add(`${source.path}: ${read.object.text}.${read.key}`);
                }
            }

            ts.forEachChild(node, visit);
        };

        visit(file);
    }

    return [...missing].toSorted();
};
