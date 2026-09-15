const SKILL_HINTS = ['javascript', 'typescript', 'react', 'node', 'python', 'java', 'sql', 'mongodb', 'aws', 'docker', 'html', 'css', 'next.js', 'express', 'git', 'figma', 'php', 'laravel', 'flutter', 'kotlin', 'swift', 'c++', 'c#', '.net', 'angular', 'vue', 'devops', 'kubernetes', 'postgres', 'mysql', 'redux', 'graphql', 'rest'];

function section(text, headings) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => headings.some((heading) => new RegExp(`^\\s*${heading}\\s*:?\\s*$`, 'i').test(line.trim()) || new RegExp(`^\\s*${heading}\\b`, 'i').test(line.trim()) && line.trim().length < 40));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => /^(education|experience|employment|work history|skills|projects|certification|summary|objective|personal|contact)\b/i.test(line.trim()) && line.trim().length < 40);
  return (next < 0 ? rest : rest.slice(0, next)).join('\n');
}

function firstMatch(text, regex) {
  return text.match(regex)?.[0] || '';
}

function splitName(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidate = lines.find((line) => line.length > 2 && line.length < 60 && !line.includes('@') && !/\d{6,}/.test(line) && !/resume|curriculum|cv|profile|objective/i.test(line));
  if (!candidate) return { firstName: '', lastName: '' };
  const parts = candidate.replace(/[^a-zA-Z .'-]/g, ' ').trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || parts[0] || '' };
}

function parseSkills(text) {
  const block = section(text, ['skills', 'technical skills', 'core skills', 'technologies']);
  const source = `${block}\n${text.slice(0, 2500)}`.toLowerCase();
  const found = SKILL_HINTS.filter((skill) => source.includes(skill));
  const extra = (block || '').split(/[,|/•\n]/).map((item) => item.trim()).filter((item) => item.length > 1 && item.length < 32).slice(0, 12);
  return [...new Set([...found.map((skill) => skill.replace(/^\w/, (letter) => letter.toUpperCase())), ...extra])].slice(0, 16).map((technology, index) => ({ technology, skillLevel: 'INTERMEDIATE', isPrimary: index < 3 }));
}

function parseEducation(text) {
  const block = section(text, ['education', 'academic', 'qualification']);
  if (!block.trim()) return [];
  return block.split(/\n{2,}|\n(?=[A-Z])/).map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 6).slice(0, 4).map((chunk) => {
    const years = [...chunk.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]));
    return {
      degree: firstMatch(chunk, /\b(b\.?tech|m\.?tech|b\.?e|m\.?e|mba|mca|bca|b\.?sc|m\.?sc|phd|bachelor|master|diploma)[^,\n]*/i) || chunk.split('\n')[0].slice(0, 80),
      institution: firstMatch(chunk, /\b(university|college|institute|school)[^,\n]*/i) || '',
      startYear: years[0],
      endYear: years[1] || years[0]
    };
  });
}

function parseExperience(text) {
  const block = section(text, ['experience', 'work experience', 'employment', 'work history', 'professional experience']);
  if (!block.trim()) return [];
  return block.split(/\n{2,}/).map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 8).slice(0, 6).map((chunk) => {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    return {
      jobTitle: lines[0]?.slice(0, 80) || '',
      companyName: lines[1]?.slice(0, 80) || '',
      responsibilities: chunk.slice(0, 500),
      yearsOfExperience: Number(firstMatch(chunk, /\b(\d+(?:\.\d+)?)\s*\+?\s*years?\b/i)) || undefined
    };
  });
}

export { extractResumeText } from './resumeExtract.service.js';

export function parseResumeText(text) {
  const clean = String(text || '').replace(/\u0000/g, ' ').replace(/[ \t]+/g, ' ');
  const email = firstMatch(clean, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i).toLowerCase();
  const phone = (firstMatch(clean, /(\+?\d[\d\s\-()]{8,16}\d)/) || '').replace(/[^\d+]/g, '').slice(0, 15);
  const { firstName, lastName } = splitName(clean);
  const linkedin = firstMatch(clean, /https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i);
  const github = firstMatch(clean, /https?:\/\/(?:www\.)?github\.com\/[^\s)]+/i);
  const locationLine = firstMatch(clean, /(?:location|address|city)\s*[:\-]\s*([^\n]{3,60})/i);
  return {
    firstName,
    lastName: lastName === firstName ? '' : lastName,
    email,
    phone: phone.length >= 7 ? phone.slice(0, 20) : '',
    location: locationLine.replace(/^(location|address|city)\s*[:\-]\s*/i, ''),
    linkedin,
    github,
    applyingPosition: firstMatch(clean, /(?:applying for|position|role)\s*[:\-]\s*([^\n]{3,60})/i).replace(/^(applying for|position|role)\s*[:\-]\s*/i, '') || '',
    skills: parseSkills(clean),
    education: parseEducation(clean),
    experience: parseExperience(clean),
    notes: '',
    resumeText: clean.slice(0, 20000)
  };
}
