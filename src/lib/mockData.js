export const MOCK_VIDEOS = [
  {
    id: "v1",
    vimeoId: "123456789",
    title: "Acme Corp - Annual Summit Highlights",
    description: "Energetic recap of the 2023 Acme Corp leadership summit. Features interviews with the CEO, keynote speakers, and b-roll of the networking events.",
    tags: ["corporate", "event", "highlights", "leadership", "premium"],
    duration: 185,
    createdAt: "2023-11-15T10:00:00Z",
    link: "https://vimeo.com/123456789",
    thumbnail: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80",
    folder: "Corporate Events",
    matchScore: 0.95,
    matchReason: "Matches because it is a premium corporate event highlight reel featuring executive interviews."
  },
  {
    id: "v2",
    vimeoId: "987654321",
    title: "HealthPlus - Patient Testimonials",
    description: "Emotional and premium storytelling piece featuring three patients discussing their recovery journeys at HealthPlus clinics.",
    tags: ["healthcare", "testimonial", "interview", "emotional"],
    duration: 240,
    createdAt: "2023-08-22T14:30:00Z",
    link: "https://vimeo.com/987654321",
    thumbnail: "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=800&q=80",
    folder: "Healthcare Campaigns",
    matchScore: 0.88,
    matchReason: "Matches because it focuses on healthcare and relies heavily on interview-led storytelling."
  },
  {
    id: "v3",
    vimeoId: "456789123",
    title: "EduTech - Vision 2025 Brand Film",
    description: "Fast-paced motion graphics mixed with live action showcasing the future of digital education platforms.",
    tags: ["education", "brand film", "motion graphics", "tech"],
    duration: 120,
    createdAt: "2024-01-10T09:15:00Z",
    link: "https://vimeo.com/456789123",
    thumbnail: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&q=80",
    folder: "Brand Films",
    matchScore: 0.75,
    matchReason: "Matches the education requirement and features a polished, premium tech aesthetic."
  },
  {
    id: "v4",
    vimeoId: "321654987",
    title: "Global Pharma - Internal Culture Doc",
    description: "A deep dive into the research and development team at Global Pharma. Very interview heavy with clinical b-roll.",
    tags: ["healthcare", "corporate", "documentary", "internal"],
    duration: 450,
    createdAt: "2022-12-05T11:45:00Z",
    link: "https://vimeo.com/321654987",
    thumbnail: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80",
    folder: "Internal Comms",
    matchScore: 0.62,
    matchReason: "Includes healthcare themes and interviews, though longer than the requested duration."
  }
];

export const CATEGORIES = ["Corporate", "Event Highlights", "Brand Film", "Testimonial", "Education", "Healthcare", "Social Impact", "Interview-led", "Motion Graphics"];
