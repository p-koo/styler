import { NextRequest, NextResponse } from 'next/server';
import { parseAndAnnotate } from '@/bootstrap/chatgpt-parser';
import { clusterConversations, mergeSimilarClusters } from '@/bootstrap/conversation-clusterer';
import { extractStylesFromConversations } from '@/bootstrap/style-extractor';
import {
  analyzeWritingStyle,
  analysisToBaseStyle,
  filterAcademicConversations,
} from '@/bootstrap/llm-style-analyzer';
import { initializeFromBootstrap, loadPreferences } from '@/memory/preference-store';
import type { ChatGPTConversation, BaseStyle, AudienceProfile } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversations, useLLMAnalysis = true, profileName, extractionPrompt } = body as {
      conversations: ChatGPTConversation[];
      useLLMAnalysis?: boolean;
      profileName?: string;
      extractionPrompt?: string;
    };

    if (!conversations || !Array.isArray(conversations)) {
      return NextResponse.json(
        { error: 'conversations array is required' },
        { status: 400 }
      );
    }

    // Parse and annotate conversations
    const parsed = parseAndAnnotate(conversations);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: 'No valid conversations found in export' },
        { status: 400 }
      );
    }

    // Check for OpenAI API key for LLM analysis
    const apiKey = process.env.OPENAI_API_KEY;

    if (useLLMAnalysis && apiKey) {
      // Use the new LLM-powered analyzer
      try {
        const result = await analyzeWritingStyle(parsed, apiKey, undefined, extractionPrompt);

        // Convert analysis to base style
        const analyzedStyle = analysisToBaseStyle(result.analysis);

        // Merge with default base style
        const baseStyle: BaseStyle = {
          verbosity: analyzedStyle.verbosity || 'moderate',
          sentencePatterns: [],
          paragraphStructure: [],
          preferredWords: analyzedStyle.preferredWords || {},
          avoidWords: analyzedStyle.avoidWords || [],
          formalityLevel: 4, // Academic writing is typically formal
          hedgingStyle: 'cautious', // Academic writing uses hedging
          activeVoicePreference: 0.7,
          formatBans: analyzedStyle.formatBans || [],
          requiredFormats: [],
          argumentStyle: [],
          transitionPhrases: [],
          learnedRules: analyzedStyle.learnedRules || [],
        };

        // Create audience profile from ChatGPT analysis
        const now = new Date().toISOString();
        const audienceProfiles: AudienceProfile[] = [];

        // Create the user's named profile based on analyzed style
        if (profileName) {
          audienceProfiles.push({
            id: `profile-chatgpt-${Date.now()}`,
            name: profileName,
            description: `Style profile extracted from ${result.conversationCount} ChatGPT conversations`,
            source: 'inferred',
            inferredFrom: parsed.slice(0, 10).map(c => c.id),
            overrides: {
              verbosity: analyzedStyle.verbosity || 'moderate',
              avoidWords: analyzedStyle.avoidWords || [],
              formatBans: analyzedStyle.formatBans || [],
            },
            jargonLevel: 'moderate',
            disciplineTerms: [],
            emphasisPoints: result.analysis.keyInsights?.slice(0, 5) || [],
            framingGuidance: result.analysis.commonComplaints?.map(c => `Avoid: ${c}`) || [],
            lengthGuidance: { target: analyzedStyle.verbosity === 'terse' ? 'concise' : 'standard' },
            createdAt: now,
            updatedAt: now,
          });
        }

        // Save to store
        const store = await initializeFromBootstrap(
          baseStyle,
          audienceProfiles,
          result.conversationCount
        );

        return NextResponse.json({
          success: true,
          method: 'llm-analysis',
          conversationsAnalyzed: result.conversationCount,
          correctionsAnalyzed: result.correctionCount,
          learnedRules: store.baseStyle.learnedRules?.length || 0,
          baseStyle: store.baseStyle,
          audienceProfiles: store.audienceProfiles,
          styleSummary: result.styleSummary,
          analysis: {
            wordPreferences: result.analysis.wordPreferences,
            tonePreferences: result.analysis.tonePreferences,
            structurePreferences: result.analysis.structurePreferences,
            formattingRules: result.analysis.formattingRules,
            commonComplaints: result.analysis.commonComplaints,
            keyInsights: result.analysis.keyInsights,
          },
        });
      } catch (llmError) {
        console.error('LLM analysis failed, falling back to basic extraction:', llmError);
        // Fall through to basic extraction
      }
    }

    // Fallback: Basic rule-based extraction
    let clusters = clusterConversations(parsed);
    clusters = mergeSimilarClusters(clusters, 3);

    const { baseStyle, audienceProfiles } = extractStylesFromConversations(parsed, clusters);

    const store = await initializeFromBootstrap(
      baseStyle,
      audienceProfiles,
      parsed.length
    );

    return NextResponse.json({
      success: true,
      method: 'basic-extraction',
      conversationsAnalyzed: parsed.length,
      clustersDetected: clusters.length,
      baseStyle: store.baseStyle,
      audienceProfiles: store.audienceProfiles,
    });
  } catch (error) {
    console.error('Bootstrap error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bootstrap failed' },
      { status: 500 }
    );
  }
}
