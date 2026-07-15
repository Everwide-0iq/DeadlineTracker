import { create } from 'zustand'
import { getCurrentTranslation } from '../i18n/i18n.store.ts'
import {
  createBoardText as createBoardTextApi,
  deleteBoardText as deleteBoardTextApi,
  fetchBoardTexts,
  subscribeToBoardTextChanges,
  updateBoardText as updateBoardTextApi,
} from './boardText.api.ts'
import type {
  BoardText,
  BoardTextEditorState,
  CreateBoardTextInput,
  UpdateBoardTextInput,
} from './boardText.types.ts'

type BoardTextState = {
  editor: BoardTextEditorState | null
  error: string | null
  hasLoaded: boolean
  isLoading: boolean
  saveError: string | null
  selectedTextId: string | null
  texts: BoardText[]
  clearSaveError: () => void
  closeEditor: () => void
  createText: (input: CreateBoardTextInput, userId: string | null) => Promise<void>
  deleteText: (id: string) => Promise<void>
  loadTexts: () => Promise<void>
  moveTextLocal: (id: string, x: number, y: number) => void
  openCreateEditor: (
    initialX: number,
    initialY: number,
    boardScope: CreateBoardTextInput['boardScope'],
    projectId: string | null,
  ) => void
  openEditEditor: (textId: string) => void
  persistTextPosition: (id: string, x: number, y: number) => Promise<void>
  persistTextWidth: (id: string, w: number) => Promise<void>
  resizeTextLocal: (id: string, w: number) => void
  selectText: (id: string | null) => void
  subscribeRealtime: () => () => void
  updateText: (id: string, input: UpdateBoardTextInput) => Promise<void>
}

const getMessage = (error: unknown) => {
  const t = getCurrentTranslation()

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const code = typeof record.code === 'string' ? record.code : null
    const message = typeof record.message === 'string' ? record.message : null

    if (code === 'PGRST205' || message?.includes("Could not find the table 'public.board_texts'")) {
      return t.errors.boardTextsMissingTable
    }

    if (message?.includes("Could not find the 'w' column")) {
      return t.errors.boardTextsMissingWidth
    }

    if (message) {
      return message
    }
  }

  return t.errors.boardTextsGeneric
}

const upsertText = (texts: BoardText[], text: BoardText) => {
  const index = texts.findIndex((item) => item.id === text.id)

  if (index === -1) {
    return [...texts, text]
  }

  const next = [...texts]
  next[index] = text
  return next
}

const restoreTextIfMissing = (texts: BoardText[], text: BoardText) =>
  texts.some((item) => item.id === text.id) ? texts : upsertText(texts, text)

const applyLocalPatch = (text: BoardText, input: UpdateBoardTextInput): BoardText => ({
  ...text,
  ...input,
  updatedAt: new Date().toISOString(),
})

export const useBoardTextStore = create<BoardTextState>((set, get) => ({
  editor: null,
  error: null,
  hasLoaded: false,
  isLoading: false,
  saveError: null,
  selectedTextId: null,
  texts: [],
  clearSaveError: () => set({ saveError: null }),
  closeEditor: () => set({ editor: null }),
  createText: async (input, userId) => {
    set({ saveError: null })

    try {
      const text = await createBoardTextApi(input, userId)
      set((state) => ({ editor: null, selectedTextId: text.id, texts: upsertText(state.texts, text) }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  deleteText: async (id) => {
    const previousState = get()
    const deletedText = previousState.texts.find((text) => text.id === id) ?? null
    const wasSelected = previousState.selectedTextId === id
    set((state) => ({
      saveError: null,
      selectedTextId: state.selectedTextId === id ? null : state.selectedTextId,
      texts: state.texts.filter((text) => text.id !== id),
    }))

    try {
      await deleteBoardTextApi(id)
    } catch (error) {
      set((state) => ({
        saveError: getMessage(error),
        selectedTextId: wasSelected && state.selectedTextId === null ? id : state.selectedTextId,
        texts: deletedText ? restoreTextIfMissing(state.texts, deletedText) : state.texts,
      }))
      throw error
    }
  },
  loadTexts: async () => {
    set({ error: null, isLoading: true })

    try {
      const texts = await fetchBoardTexts()
      set({ error: null, hasLoaded: true, isLoading: false, texts })
    } catch (error) {
      set({ error: getMessage(error), hasLoaded: true, isLoading: false })
    }
  },
  moveTextLocal: (id, x, y) => {
    set((state) => ({
      texts: state.texts.map((text) => (text.id === id ? { ...text, x, y } : text)),
    }))
  },
  openCreateEditor: (initialX, initialY, boardScope, projectId) =>
    set({ editor: { mode: 'create', boardScope, initialX, initialY, projectId } }),
  openEditEditor: (textId) => set({ editor: { mode: 'edit', textId }, selectedTextId: textId }),
  persistTextPosition: async (id, x, y) => {
    set({ saveError: null })

    try {
      const text = await updateBoardTextApi(id, { x, y })
      set((state) => ({ texts: upsertText(state.texts, text) }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  persistTextWidth: async (id, w) => {
    set({ saveError: null })

    try {
      const text = await updateBoardTextApi(id, { w })
      set((state) => ({ texts: upsertText(state.texts, text) }))
    } catch (error) {
      set({ saveError: getMessage(error) })
      throw error
    }
  },
  resizeTextLocal: (id, w) => {
    set((state) => ({
      texts: state.texts.map((text) => (text.id === id ? { ...text, w } : text)),
    }))
  },
  selectText: (id) => set({ selectedTextId: id }),
  subscribeRealtime: () =>
    subscribeToBoardTextChanges((event) => {
      if (event.type === 'DELETE') {
        set((state) => ({
          selectedTextId: state.selectedTextId === event.id ? null : state.selectedTextId,
          texts: state.texts.filter((text) => text.id !== event.id),
        }))
        return
      }

      set((state) => ({ texts: upsertText(state.texts, event.text) }))
    }),
  updateText: async (id, input) => {
    const previousText = get().texts.find((text) => text.id === id) ?? null
    const optimisticText = previousText ? applyLocalPatch(previousText, input) : null
    set((state) => ({
      saveError: null,
      texts: state.texts.map((text) =>
        text.id === id && optimisticText ? optimisticText : text,
      ),
    }))

    try {
      const text = await updateBoardTextApi(id, input)
      set((state) => ({ editor: null, texts: upsertText(state.texts, text) }))
    } catch (error) {
      set((state) => {
        const currentText = state.texts.find((text) => text.id === id)
        const shouldRollback =
          previousText && optimisticText && currentText?.updatedAt === optimisticText.updatedAt

        return {
          saveError: getMessage(error),
          texts: shouldRollback ? upsertText(state.texts, previousText) : state.texts,
        }
      })

      throw error
    }
  },
}))
