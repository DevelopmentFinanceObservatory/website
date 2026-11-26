'use client';

import { createContext, useContext } from 'react';

import type { StudioModel } from './useStudio';

import type { StudioVariant } from '@/lib/studio/variant';

const StudioContext = createContext<StudioModel | null>(null);

/** Hands the Studio's model (useStudio) to the layout drawn inside it. */
export const StudioProvider = StudioContext.Provider;

/** The Studio's model, for a component inside StudioProvider. */
export const useStudioModel = (): StudioModel => {
    const model = useContext(StudioContext);

    if (!model) {
        throw new Error('useStudioModel needs a StudioProvider above it');
    }

    return model;
};

/** The variant of the Studio around a component, `classic` outside one.
 *  For the leaves that record usage events. */
export const useStudioVariant = (): StudioVariant =>
    useContext(StudioContext)?.variant ?? 'classic';
