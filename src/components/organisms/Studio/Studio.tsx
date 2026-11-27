'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

import { StudioProvider } from './hooks/studioContext';
import { type StudioProps, useStudio } from './hooks/useStudio';
import ClassicShell from './shells/ClassicShell';

import type { StudioVariant } from '@/lib/studio/variant';

export type { StudioProps } from './hooks/useStudio';

// Loaded on its own, so Classic pages carry none of the Prompt layout's code.
const PromptShell = dynamic(() => import('./shells/prompt/PromptShell'));

/**
 * The layout that draws a Studio for `variant`. A share (`shared`) always
 * shows the classic layout.
 */
const shellFor = (variant: StudioVariant, shared: boolean): ReactNode =>
    variant === 'prompt' && !shared ? <PromptShell /> : <ClassicShell />;

/**
 * The Studio: one model (useStudio) over the conversation, the canvas
 * document, saving and the modals, drawn by the layout the page picked.
 * The pieces live in ./hooks, ./shells, ./landing, ./workspace, ./canvas
 * and ./modals.
 */
const Studio = (props: StudioProps) => {
    const model = useStudio(props);

    return <StudioProvider value={model}>{shellFor(model.variant, !!props.shared)}</StudioProvider>;
};

export default Studio;
