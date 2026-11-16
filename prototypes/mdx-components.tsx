import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';

import styles from './components/Prose/Prose.module.scss';

// The site's type scale for every MDX page. A root-relative Markdown link
// goes through next/link, which prefixes /prototypes, so links to the main site
// are written as absolute https://developmentfinance.org/... URLs.
/** A heading's anchor id from its text, such as `two-views` for "Two views". */
const slug = (children: unknown): string | undefined =>
    typeof children === 'string'
        ? children
              .toLowerCase()
              .normalize('NFD')
              .replace(/[^a-z0-9\s-]/g, '')
              .trim()
              .replace(/\s+/g, '-')
        : undefined;

const components: MDXComponents = {
    wrapper: ({ children }) => <div className={styles.prose}>{children}</div>,
    h1: (props) => <h1 className={styles.h1} {...props} />,
    h2: (props) => <h2 className={styles.h2} id={slug(props.children)} {...props} />,
    h3: (props) => <h3 className={styles.h3} {...props} />,
    p: (props) => <p className={styles.p} {...props} />,
    ul: (props) => <ul className={styles.list} {...props} />,
    ol: (props) => <ol className={styles.list} {...props} />,
    code: (props) => <code className={styles.code} {...props} />,
    a: ({ href = '', ...props }) =>
        href.startsWith('/') ? (
            <Link className={styles.a} href={href} {...props} />
        ) : (
            <a className={styles.a} href={href} {...props} />
        ),
};

export const useMDXComponents = (): MDXComponents => components;
