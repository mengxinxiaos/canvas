import { createContext, useContext } from 'react';

const getDocumentOverlayContainer = () => document.body;

// A top-layer editor owns its child overlays. Ordinary page controls keep using
// the document body, so anchored transforms cannot shift fixed-position popups.
export const OverlayContainerContext = createContext(getDocumentOverlayContainer);

export function useOverlayContainer() {
    return useContext(OverlayContainerContext);
}
