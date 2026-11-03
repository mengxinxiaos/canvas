import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getModelConfig } from '../../../../config/models';
import { createGenerationParams, normalizeGenerationParams } from '../utils/generationParams';

const PARAMETER_KEYS = [
    'aspectRatio', 'imageSize', 'duration', 'resolution',
    'gridMode', 'imageStyle', 'videoRefMode',
];

function serializeParams(params, mode) {
    return {
        model: mode === 'image' ? params.imageModel : params.videoModel,
        ...Object.fromEntries(PARAMETER_KEYS.map(key => [key, params[key]])),
    };
}

// Prompt, references and unrelated generation metadata must not reset local controls.
function parameterSignature(generation, mode) {
    return JSON.stringify({
        model: generation.model,
        ...Object.fromEntries(PARAMETER_KEYS.map(key => [key, generation[key]])),
        mode,
    });
}

export function useGenerationParams(
    anchorNode,
    mode,
    updateNodeData,
    inputPicturesCount = 0,
    hasMediaInput = false,
    persistGeneration
) {
    const [params, setParams] = useState(() => createGenerationParams(
        anchorNode.generation || {}, mode, { inputPicturesCount, hasMediaInput }
    ));
    const stateRef = useRef(params);
    const generationRef = useRef(anchorNode.generation || {});
    const sourceSignature = parameterSignature(anchorNode.generation || {}, mode);
    const observedSourceRef = useRef(sourceSignature);

    useEffect(() => {
        generationRef.current = anchorNode.generation || {};
    }, [anchorNode.generation]);

    const currentModelId = mode === 'image' ? params.imageModel : params.videoModel;
    const config = useMemo(() => getModelConfig(mode, currentModelId), [mode, currentModelId]);

    const persistParamsToNode = useCallback((nextParams, overrides = {}) => {
        const patch = { ...serializeParams(nextParams, mode), ...overrides };
        if (persistGeneration) {
            persistGeneration(patch);
            return;
        }
        const nextGeneration = { ...generationRef.current, ...patch };
        generationRef.current = nextGeneration;
        updateNodeData?.(anchorNode.id, { generation: nextGeneration });
    }, [anchorNode.id, mode, updateNodeData, persistGeneration]);

    const updateParam = useCallback((key, value) => {
        const next = normalizeGenerationParams(
            { ...stateRef.current, [key]: value },
            mode,
            { inputPicturesCount, hasMediaInput }
        );
        // Update the ref in the event, so rapid edits and immediate saves see the same values.
        // Persistence is deliberately outside a React state updater (StrictMode can replay it).
        stateRef.current = next;
        setParams(next);
        persistParamsToNode(next);
        return next;
    }, [mode, inputPicturesCount, hasMediaInput, persistParamsToNode]);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            const sourceChanged = observedSourceRef.current !== sourceSignature;
            observedSourceRef.current = sourceSignature;
            let source = stateRef.current;

            // The node store is authoritative. A prior value can be an intentional
            // undo/redo; value signatures are not persistence revision numbers.
            if (sourceChanged) {
                source = createGenerationParams(JSON.parse(sourceSignature), mode, {
                    inputPicturesCount, hasMediaInput,
                });
            }

            const next = normalizeGenerationParams(source, mode, {
                inputPicturesCount, hasMediaInput,
            });
            const nextSignature = parameterSignature(serializeParams(next, mode), mode);
            const currentSignature = parameterSignature(serializeParams(stateRef.current, mode), mode);
            if (nextSignature === currentSignature) return;

            stateRef.current = next;
            setParams(next);
            // Reference constraints can force a supported mode. Store that correction
            // without treating unrelated source metadata as a parameter change.
            if (!sourceChanged) persistParamsToNode(next);
        });
        return () => { cancelled = true; };
    }, [sourceSignature, mode, inputPicturesCount, hasMediaInput, persistParamsToNode]);

    const getParams = useCallback(() => stateRef.current, []);

    const syncToNode = useCallback((overrides = {}) => {
        const next = normalizeGenerationParams(
            { ...stateRef.current, ...overrides },
            mode,
            { inputPicturesCount, hasMediaInput }
        );
        stateRef.current = next;
        setParams(next);
        // Only explicitly supplied prompt/reference fields are written; parameter edits
        // must never reset the asset order or the latest prompt.
        const extraGeneration = Object.fromEntries(
            ['prompt', 'inputs', 'referenceNodeIds', 'rawPrompt', 'finalPrompt', 'apiMode']
                .filter(key => overrides[key] !== undefined)
                .map(key => [key, overrides[key]])
        );
        persistParamsToNode(next, extraGeneration);
    }, [mode, inputPicturesCount, hasMediaInput, persistParamsToNode]);

    return { params, updateParam, syncToNode, getParams, config };
}
