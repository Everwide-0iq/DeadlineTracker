import { create } from 'zustand'
import type { BoardCamera } from './useBoardCamera.ts'

type BoardMotionState = {
  liveCamera: BoardCamera | null
  clearLiveCamera: () => void
  setLiveCamera: (camera: BoardCamera) => void
}

export const useBoardMotionStore = create<BoardMotionState>((set) => ({
  liveCamera: null,
  clearLiveCamera: () => set({ liveCamera: null }),
  setLiveCamera: (liveCamera) => set({ liveCamera }),
}))

