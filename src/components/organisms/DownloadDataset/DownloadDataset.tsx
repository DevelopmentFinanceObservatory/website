'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import styles from './DownloadDataset.module.scss';
import { startDatasetNet } from './dataset-net';

import Button from '@/components/atoms/Button/Button';
import DataPrompt from '@/components/molecules/DataPrompt/DataPrompt';
import SectionHeading from '@/components/molecules/SectionHeading/SectionHeading';
import StatTiles from '@/components/molecules/StatTiles/StatTiles';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { catalogueChips, catalogueTiles, type SearchCatalogue } from '@/lib/search/catalogue';

// `catalogue` is the search catalogue the homepage loaded on the server, or
// null: its examples are the chips, its counts the tiles.
const DownloadDataset = ({ catalogue }: { catalogue: SearchCatalogue | null }) => {
    const router = useRouter();
    const sectionRef = useReveal<HTMLElement>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const tiles = catalogueTiles(catalogue);

    useEffect(() => {
        if (!sectionRef.current || !canvasRef.current) {
            return;
        }

        return startDatasetNet(sectionRef.current, canvasRef.current);
    }, [sectionRef]);

    return (
        <section
            ref={sectionRef}
            className={styles.section}
            aria-labelledby="download-dataset-title"
        >
            <canvas ref={canvasRef} className={styles.net} aria-hidden="true" />
            <div className={styles.intro}>
                <SectionHeading
                    id="download-dataset-title"
                    label="Download a Dataset"
                    title="Pulled from the DFO knowledge graph, shaped to your needs"
                    className={styles.headingBlock}
                />
                <div className={styles.aside} data-reveal-group="trigger">
                    <p className={styles.description} data-reveal="text" style={revealIndex(0)}>
                        Describe the data you need, tune your parameters, and export a clean
                        structured dataset from over 40,000 indicators with more to come.
                    </p>
                    <Button
                        variant="dark"
                        icon="arrow-up-right"
                        data-reveal
                        style={revealIndex(1)}
                        onClick={() => router.push('/data/roadmap')}
                    >
                        View Roadmap
                    </Button>
                </div>
            </div>
            <div className={styles.prompt}>
                <DataPrompt
                    suggestions={catalogueChips(catalogue)}
                    onSubmit={(query) => router.push(`/data?q=${encodeURIComponent(query)}`)}
                />
            </div>
            {tiles.length > 0 && (
                <div className={styles.tiles}>
                    <StatTiles stats={tiles} />
                </div>
            )}
        </section>
    );
};

export default DownloadDataset;
