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
            : resolve(dirname(from), specifier),
    );

export const stateClasses = (
    sources: Source[],
    styles: StyleModules,
    repo: string,
): StateClasses => {
    const found = new Map<string, Set<string>>();

    for (const { path, text } of sources) {
        const file = ts.createSourceFile(
            path,
            text,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
        );
        // The local names of the `classnames` import and of each SCSS module.
        const joiners = new Set<string>();
        const modules = new Map<string, Record<string, string>>();

        for (const statement of file.statements) {
            const name = ts.isImportDeclaration(statement) && statement.importClause?.name?.text;

            if (!name || !ts.isStringLiteral(statement.moduleSpecifier)) {
                continue;
            }

            const specifier = statement.moduleSpecifier.text;

            if (specifier === 'classnames') {
                joiners.add(name);
            } else if (specifier.endsWith('.module.scss')) {
                const map = styles[modulePath(specifier, path, repo)];

                if (map) {
                    modules.set(name, map);
                }
            }
        }

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
