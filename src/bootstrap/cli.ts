#!/usr/bin/env npx tsx
/**
 * Bootstrap CLI
 *
 * Import ChatGPT export and generate preference profiles.
 *
 * Usage: npm run bootstrap -- --file conversations.json
 */

import { readFileSync } from 'fs';
import { parseAndAnnotate } from './chatgpt-parser';
import { clusterConversations, mergeSimilarClusters } from './conversation-clusterer';
import { extractStylesFromConversations } from './style-extractor';
import { initializeFromBootstrap } from '../memory/preference-store';
import type { ChatGPTConversation } from '../types';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let filePath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '-f') {
      filePath = args[i + 1];
      i++;
    }
  }

  if (!filePath) {
    console.error('Usage: npm run bootstrap -- --file <path-to-conversations.json>');
    console.error('');
    console.error('To export your ChatGPT data:');
    console.error('1. Go to ChatGPT Settings → Data Controls → Export Data');
    console.error('2. Download the ZIP file');
    console.error('3. Extract and use the conversations.json file');
    process.exit(1);
  }

  console.log(`Reading ${filePath}...`);

  let rawData: ChatGPTConversation[];
  try {
    const content = readFileSync(filePath, 'utf-8');
    rawData = JSON.parse(content);
  } catch (err) {
    console.error(`Error reading file: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  if (!Array.isArray(rawData)) {
    console.error('Error: Expected an array of conversations');
    process.exit(1);
  }

  console.log(`Found ${rawData.length} conversations`);

  // Parse and annotate
  console.log('Parsing conversations...');
  const parsed = parseAndAnnotate(rawData);
  console.log(`Parsed ${parsed.length} valid conversations`);

  // Show detected types
  const typeCounts = new Map<string, number>();
  for (const conv of parsed) {
    const type = conv.detectedType || 'general';
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  console.log('\nDetected conversation types:');
  for (const [type, count] of typeCounts) {
    console.log(`  ${type}: ${count}`);
  }

  // Cluster
  console.log('\nClustering conversations...');
  let clusters = clusterConversations(parsed);
  clusters = mergeSimilarClusters(clusters, 3);

  console.log(`Created ${clusters.length} clusters:`);
  for (const cluster of clusters) {
    console.log(`  ${cluster.name}: ${cluster.conversations.length} conversations`);
  }

  // Extract styles
  console.log('\nExtracting writing style...');
  const { baseStyle, audienceProfiles } = extractStylesFromConversations(parsed, clusters);

  // Show extracted preferences
  console.log('\n=== Base Style ===');
  console.log(`Verbosity: ${baseStyle.verbosity}`);
  console.log(`Formality: ${baseStyle.formalityLevel}/5`);
  console.log(`Hedging: ${baseStyle.hedgingStyle}`);

  if (baseStyle.avoidWords.length > 0) {
    console.log(`Words to avoid: ${baseStyle.avoidWords.slice(0, 10).join(', ')}`);
  }

  if (Object.keys(baseStyle.preferredWords).length > 0) {
    console.log('Word substitutions:');
    for (const [from, to] of Object.entries(baseStyle.preferredWords).slice(0, 5)) {
      console.log(`  "${from}" → "${to}"`);
    }
  }

  if (baseStyle.formatBans.length > 0) {
    console.log(`Format bans: ${baseStyle.formatBans.join(', ')}`);
  }

  if (baseStyle.learnedRules.length > 0) {
    console.log(`\nLearned rules: ${baseStyle.learnedRules.length}`);
    for (const rule of baseStyle.learnedRules.slice(0, 3)) {
      console.log(`  - ${rule.rule.slice(0, 80)}...`);
    }
  }

  console.log('\n=== Audience Profiles ===');
  for (const profile of audienceProfiles) {
    console.log(`\n${profile.name}`);
    console.log(`  Jargon level: ${profile.jargonLevel}`);
    if (profile.emphasisPoints.length > 0) {
      console.log(`  Emphasis: ${profile.emphasisPoints.join(', ')}`);
    }
    if (profile.lengthGuidance) {
      console.log(`  Length: ${profile.lengthGuidance.target}`);
    }
  }

  // Save
  console.log('\nSaving preferences...');
  await initializeFromBootstrap(baseStyle, audienceProfiles, parsed.length);

  console.log('\nBootstrap complete!');
  console.log('Run `npm run dev` to start the web interface.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
