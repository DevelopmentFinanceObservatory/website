import { jsonLdText } from '@/lib/structuredData';

/** A schema.org JSON-LD block. */
const JsonLd = ({ data }: { data: object }): React.JSX.Element => (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />
);

export default JsonLd;
