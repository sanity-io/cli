import blockContent from './blockContent.js'
import crewMember from './crewMember.js'
import castMember from './castMember.js'
import movie from './movie.js'
import person from './person.js'
import screening from './screening.js'
import plotSummary from './plotSummary.js'
import plotSummaries from './plotSummaries.js'

export const schemaTypes = [
  // Document types
  movie,
  person,
  screening,

  // Other types
  blockContent,
  plotSummary,
  plotSummaries,
  castMember,
  crewMember,
]
