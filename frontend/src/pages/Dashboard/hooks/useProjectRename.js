import { useCallback, useMemo, useState } from 'react';

export function useProjectRename({ onSubmit }) {
  const [state, setState] = useState({
    id: null,
    draft: '',
    submitting: false,
    error: null,
  });

  const isRenaming = useCallback(
    (projectId) => state.id === projectId,
    [state.id]
  );

  const startRename = useCallback((project) => {
    setState({
      id: project.id,
      draft: project.name ?? '',
      submitting: false,
      error: null,
    });
  }, []);

  const changeDraft = useCallback((value) => {
    setState((prev) => ({
      ...prev,
      draft: value,
      error: null,
    }));
  }, []);

  const cancelRename = useCallback(() => {
    setState({
      id: null,
      draft: '',
      submitting: false,
      error: null,
    });
  }, []);

  const commitRename = useCallback(async () => {
    const id = state.id;
    const name = state.draft.trim();

    if (!id) return { ok: false, reason: 'missing-id' };

    if (!name) {
      setState((prev) => ({
        ...prev,
        error: '名称不能为空',
      }));
      return { ok: false, reason: 'empty-name' };
    }

    setState((prev) => ({
      ...prev,
      submitting: true,
      error: null,
    }));

    try {
      await onSubmit(id, name);
      setState({
        id: null,
        draft: '',
        submitting: false,
        error: null,
      });
      return { ok: true };
    } catch (error) {
      setState((prev) => ({
        ...prev,
        submitting: false,
        error: error?.message || '重命名失败，请重试',
      }));
      return { ok: false, reason: 'submit-failed', error };
    }
  }, [onSubmit, state.id, state.draft]);

  return useMemo(
    () => ({
      editingId: state.id,
      draft: state.draft,
      submitting: state.submitting,
      error: state.error,
      isRenaming,
      startRename,
      changeDraft,
      cancelRename,
      commitRename,
    }),
    [
      state.id,
      state.draft,
      state.submitting,
      state.error,
      isRenaming,
      startRename,
      changeDraft,
      cancelRename,
      commitRename,
    ]
  );
}