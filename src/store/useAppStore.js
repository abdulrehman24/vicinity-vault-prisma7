"use client";

import { create } from "zustand";
import { MOCK_VIDEOS } from "@/src/lib/mockData";

export const useAppStore = create((set, get) => ({
  isAuthenticated: false,
  currentUser: { name: "Alex Thompson", avatar: "AT" },
  login: () => set({ isAuthenticated: true }),
  logout: () => set({ isAuthenticated: false }),
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
  isSearching: false,
  searchResults: [],
  featuredWorks: [MOCK_VIDEOS[0], MOCK_VIDEOS[1]],
  aiConfig: {
    openaiKey: "sk-proj-••••••••••••••••",
    embeddingModel: "text-embedding-3-small",
    completionModel: "gpt-4o-mini",
    similarityThreshold: 0.65,
    matchReasonPrompt:
      "In one short, punchy sentence, explain to a salesperson why this video is a good match for the client brief. Start with 'Matches because...'",
    autoSyncEnabled: true
  },
  updateAiConfig: (updates) =>
    set((state) => ({
      aiConfig: { ...state.aiConfig, ...updates }
    })),
  sources: [
    {
      id: "src_1",
      name: "Primary Studio Account",
      type: "Vimeo",
      apiKey: "vmo_prod_a928...",
      status: "Connected",
      lastSync: "2024-03-20T10:00:00Z",
      videoCount: 2450
    },
    {
      id: "src_2",
      name: "Archive & Legacy Vault",
      type: "Vimeo",
      apiKey: "vmo_arch_k281...",
      status: "Connected",
      lastSync: "2024-03-18T15:30:00Z",
      videoCount: 1831
    }
  ],
  addSource: (source) =>
    set((state) => ({
      sources: [
        ...state.sources,
        {
          ...source,
          id: `src_${Math.random().toString(36).slice(2, 7)}`,
          status: "Connected",
          lastSync: new Date().toISOString(),
          videoCount: 0
        }
      ]
    })),
  removeSource: (id) =>
    set((state) => ({
      sources: state.sources.filter((s) => s.id !== id)
    })),
  updateSource: (id, updates) =>
    set((state) => ({
      sources: state.sources.map((s) => (s.id === id ? { ...s, ...updates } : s))
    })),
  toggleFeaturedWork: (video) =>
    set((state) => {
      const exists = state.featuredWorks.find((v) => v.id === video.id);
      if (exists) {
        return { featuredWorks: state.featuredWorks.filter((v) => v.id !== video.id) };
      }
      return { featuredWorks: [...state.featuredWorks, video] };
    }),
  playlists: [
    {
      id: "p1",
      name: "Healthcare Pitch 2024",
      description: "Selection of medical and biotech event reels",
      videoIds: ["v2", "v4"],
      createdBy: "Sarah Chen",
      createdAt: "2024-03-15T10:30:00Z"
    },
    {
      id: "p2",
      name: "Brand Storytelling",
      description: "Premium cinematic brand films",
      videoIds: ["v3"],
      createdBy: "Marcus Wright",
      createdAt: "2024-02-10T14:45:00Z"
    }
  ],
  personalCollections: [
    {
      id: "pc1",
      name: "My Q4 Prep",
      description: "Videos I want to study for the upcoming tech summit.",
      videoIds: ["v1"],
      createdAt: new Date().toISOString()
    }
  ],
  createPlaylist: (name, description) =>
    set((state) => ({
      playlists: [
        ...state.playlists,
        {
          id: Math.random().toString(36).slice(2, 11),
          name,
          description,
          videoIds: [],
          createdBy: state.currentUser.name,
          createdAt: new Date().toISOString()
        }
      ]
    })),
  createPersonalCollection: (name, description) =>
    set((state) => ({
      personalCollections: [
        ...state.personalCollections,
        {
          id: Math.random().toString(36).slice(2, 11),
          name,
          description,
          videoIds: [],
          createdAt: new Date().toISOString()
        }
      ]
    })),
  deletePlaylist: (id) =>
    set({
      playlists: get().playlists.filter((p) => p.id !== id)
    }),
  deletePersonalCollection: (id) =>
    set({
      personalCollections: get().personalCollections.filter((p) => p.id !== id)
    }),
  addVideoToPlaylist: (playlistId, videoId) =>
    set({
      playlists: get().playlists.map((p) =>
        p.id === playlistId && !p.videoIds.includes(videoId) ? { ...p, videoIds: [...p.videoIds, videoId] } : p
      )
    }),
  removeVideoFromPlaylist: (playlistId, videoId) =>
    set({
      playlists: get().playlists.map((p) =>
        p.id === playlistId ? { ...p, videoIds: p.videoIds.filter((id) => id !== videoId) } : p
      )
    }),
  addVideoToPersonalCollection: (collectionId, videoId) =>
    set({
      personalCollections: get().personalCollections.map((p) =>
        p.id === collectionId && !p.videoIds.includes(videoId) ? { ...p, videoIds: [...p.videoIds, videoId] } : p
      )
    }),
  removeVideoFromPersonalCollection: (collectionId, videoId) =>
    set({
      personalCollections: get().personalCollections.map((p) =>
        p.id === collectionId ? { ...p, videoIds: p.videoIds.filter((id) => id !== videoId) } : p
      )
    }),
  performSearch: async (query) => {
    set({ isSearching: true, searchQuery: query });
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (!query.trim()) {
      set({ searchResults: [], isSearching: false });
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results = MOCK_VIDEOS.map((v) => {
      let score = v.matchScore;
      if (v.title.toLowerCase().includes(lowerQuery) || v.tags.some((t) => t.toLowerCase().includes(lowerQuery))) {
        score += 0.1;
      }
      return { ...v, matchScore: Math.min(score, 0.99) };
    }).sort((a, b) => b.matchScore - a.matchScore);

    set({ searchResults: results, isSearching: false });
  }
}));
