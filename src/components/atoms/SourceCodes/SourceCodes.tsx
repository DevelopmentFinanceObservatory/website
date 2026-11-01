import { type SourceCodeGroups, sourceCodeParts } from '@/lib/sourceCodes';

/** The publisher's own series codes as a sentence, each code in <code>:
 *  "World Bank code DT.TDS.DEGG.CD", or "Built from World Bank codes A, B
 *  and C". The caller's class styles the line and its codes. */
const SourceCodes = ({ codes, className }: { codes: SourceCodeGroups; className?: string }) => (
    <span className={className}>
        {sourceCodeParts(codes).map((part, index) =>
            'code' in part ? <code key={index}>{part.code}</code> : part.text,
        )}
    </span>
);

export default SourceCodes;
