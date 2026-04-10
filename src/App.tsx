/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import Markdown from 'react-markdown';
import { Search, Cpu, Zap, Activity, BookOpen, AlertCircle, Loader2, ShieldAlert, ShieldCheck, ChevronDown, ExternalLink, FileText, Factory, Tag, HelpCircle, Info, MessageSquare, Send, Bot, X, Menu, Github, Linkedin } from 'lucide-react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

interface Pin {
  number: string;
  name: string;
  description: string;
}

interface PackageData {
  name: string;
  pins: Pin[];
}

interface Rating {
  parameter: string;
  value: string;
}

interface ComponentData {
  isGenericQuery: boolean;
  isDiscrete: boolean;
  matchStatus: 'Exact Part Match' | 'Family Match' | 'Approximate Match' | 'No Reliable Match';
  sourceTrustLevel: 'Official Manufacturer Source' | 'Authorized Distributor Source' | 'External Reference' | 'Unverified';
  sourceReasoning: string;
  partType: string;
  supplyRange: string;
  partNumber: string;
  description: string;
  manufacturer: string;
  datasheetTitle: string;
  revision: string;
  sourceLink: string;
  packages: PackageData[];
  absoluteMaximumRatings: Rating[];
  recommendedOperatingConditions: Rating[];
  studentUsageNotes: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<ComponentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPackageIndex, setSelectedPackageIndex] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [answerLength, setAnswerLength] = useState<'quick' | 'detailed'>('quick');
  const [chatLoadingState, setChatLoadingState] = useState('');

  const suggestedQuestions = [
    "What is Pin 1 used for?",
    "What is the supply range?",
    "Is this part suitable for breadboard use?",
    "What should I be careful about in this package?"
  ];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setData(null);
    setSelectedPackageIndex(0);
    setChatMessages([]);
    setChatInput('');
    setIsChatOpen(false);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Provide a structured engineering datasheet summary for the component: "${query}".
        
IMPORTANT RULES:
1. Multi-Manufacturer: Search across all major semiconductor manufacturers (TI, Analog Devices, ST, Microchip, NXP, etc.).
2. Generic Queries: If the query is vague or generic (e.g., "220 ohm resistor", "capacitor", "NPN transistor"), set isGenericQuery to true and leave other fields with placeholder/empty values.
3. Component Type: Distinguish between ICs (Integrated Circuits) and Discrete components (Transistors, Diodes, Resistors, Capacitors, etc.). Set isDiscrete to true for discrete parts.
4. Source Trust Policy: Prioritize official manufacturer datasheets first. If not found, use authorized distributors. Fall back to external references only if necessary. Set sourceTrustLevel accordingly.
5. Match Quality: Set matchStatus accurately. If you can't find the exact part, but find the family, use "Family Match".
6. Safety: Do NOT hallucinate pinouts or limits. If uncertain, set sourceTrustLevel to "Unverified" or matchStatus to "No Reliable Match".
7. Prioritize structured engineering output (pinouts, limits) over long generic text.
8. FULL PINOUT MANDATORY: You MUST provide the COMPLETE pin configuration for every package. Never truncate, summarize, or show only "important" pins. If a part has 40 pins, list all 40. If it has 100, list all 100. This is a core engineering requirement.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isGenericQuery: { type: Type.BOOLEAN, description: 'True if the user entered a generic component instead of a specific part number.' },
              isDiscrete: { type: Type.BOOLEAN, description: 'True if the component is a discrete part (transistor, diode, etc.) and NOT an integrated circuit.' },
              matchStatus: { 
                type: Type.STRING, 
                description: 'Match quality',
                enum: ['Exact Part Match', 'Family Match', 'Approximate Match', 'No Reliable Match']
              },
              sourceTrustLevel: { 
                type: Type.STRING, 
                description: 'Source trust level',
                enum: ['Official Manufacturer Source', 'Authorized Distributor Source', 'External Reference', 'Unverified']
              },
              sourceReasoning: { type: Type.STRING, description: 'Short explanation of why this source was selected.' },
              partType: { type: Type.STRING, description: 'General category of the part (e.g., "Operational Amplifier")' },
              supplyRange: { type: Type.STRING, description: 'Quick summary of supply voltage/current range.' },
              partNumber: { type: Type.STRING, description: 'The official component part number (e.g., LM358)' },
              description: { type: Type.STRING, description: 'A short 1-2 sentence description of what the component is.' },
              manufacturer: { type: Type.STRING, description: 'The manufacturer (e.g., Texas Instruments, STMicroelectronics)' },
              datasheetTitle: { type: Type.STRING, description: 'The official title of the datasheet' },
              revision: { type: Type.STRING, description: 'The datasheet revision (e.g., Rev. W) or "Unknown"' },
              sourceLink: { type: Type.STRING, description: 'URL to the official datasheet or a reliable reference.' },
              packages: {
                type: Type.ARRAY,
                description: 'List of available packages and their pinouts.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Package name (e.g., DIP-8, SOIC-8)' },
                    pins: {
                      type: Type.ARRAY,
                      description: 'List of pins for this package, ordered by pin number.',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          number: { type: Type.STRING, description: 'Pin number (e.g., 1, 2, A1)' },
                          name: { type: Type.STRING, description: 'Pin name/symbol (e.g., VCC, GND, IN+)' },
                          description: { type: Type.STRING, description: 'Brief description of the pin function.' }
                        },
                        required: ['number', 'name', 'description']
                      }
                    }
                  },
                  required: ['name', 'pins']
                }
              },
              absoluteMaximumRatings: {
                type: Type.ARRAY,
                description: 'Absolute maximum ratings (stress limits).',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    parameter: { type: Type.STRING, description: 'Parameter name (e.g., Supply Voltage)' },
                    value: { type: Type.STRING, description: 'Value with units (e.g., 36 V)' }
                  },
                  required: ['parameter', 'value']
                }
              },
              recommendedOperatingConditions: {
                type: Type.ARRAY,
                description: 'Recommended operating conditions for normal function.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    parameter: { type: Type.STRING, description: 'Parameter name (e.g., Supply Voltage)' },
                    value: { type: Type.STRING, description: 'Value with units (e.g., 3 V to 32 V)' }
                  },
                  required: ['parameter', 'value']
                }
              },
              studentUsageNotes: { type: Type.STRING, description: 'Simple, practical usage notes for an electrical engineering student.' },
            },
            required: [
              'isGenericQuery', 'isDiscrete', 'matchStatus', 'sourceTrustLevel', 'sourceReasoning', 'partType', 'supplyRange',
              'partNumber', 'description', 'manufacturer', 'datasheetTitle', 'revision', 
              'sourceLink', 'packages', 'absoluteMaximumRatings', 'recommendedOperatingConditions', 'studentUsageNotes'
            ],
          },
        },
      });

      if (response.text) {
        const parsedData = JSON.parse(response.text) as ComponentData;
        setData(parsedData);
      } else {
        setError('Failed to generate summary. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data.');
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async (e?: React.FormEvent, questionOverride?: string) => {
    if (e) e.preventDefault();
    const userMsg = questionOverride || chatInput.trim();
    if (!userMsg || !data || isChatLoading) return;

    // Keep chat history very short (UI only shows history, but we only send latest context to API)
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setIsChatLoading(true);
    setChatLoadingState('Connecting...');

    try {
      const timeoutId = setTimeout(() => setChatLoadingState('Generating answer...'), 1000);

      // Only send essential context to reduce tokens
      const relevantPackage = data.packages?.[selectedPackageIndex] || data.packages?.[0];
      
      const prompt = `You are a focused technical datasheet assistant for the ${data.partNumber}.
Context:
- Part: ${data.partNumber} (${data.manufacturer})
- Package: ${relevantPackage?.name || 'N/A'}
- Source: ${data.sourceTrustLevel}
- Key Specs: ${data.supplyRange}
- Pins: ${relevantPackage?.pins?.map(p => `${p.number}:${p.name}`).join(', ')}

User Question: "${userMsg}"

Mode: ${answerLength.toUpperCase()}
${answerLength === 'quick' 
  ? `Constraint: ULTRA-CONCISE. Max 4 short bullet points.
Rules for QUICK:
1. Start with the direct answer immediately.
2. No long explanations or repetition.
3. Format: Direct answer, Key reference, Pin/order/value, Short caution.
4. Orientation: State exact viewing direction first (e.g., "Bottom view").
5. Pin order: Show shortest possible string (e.g., "1=E, 2=B, 3=C").` 
  : 'Constraint: Max 200 words. Structured sections, concise, no fluff.'}

Rules:
1. Answer ONLY based on the provided context or official ${data.partNumber} specs.
2. If uncertain, say "Information not in datasheet context" briefly.
3. Use compact engineering formatting. Every bullet on a new line.
4. No general chatbot behavior.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', // Use lightweight model for speed/quota
        contents: prompt,
      });

      clearTimeout(timeoutId);

      const reply = response.text || "I'm sorry, I couldn't generate a response.";
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      console.error("Chat error:", err);
      let errorMessage = "Could not connect to the assistant. Please try again.";
      if (err.message?.includes('quota')) {
        errorMessage = "API quota exceeded. Please try again later.";
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMessage}` }]);
    } finally {
      setIsChatLoading(false);
      setChatLoadingState('');
    }
  };

  const selectedPackage = data?.packages?.[selectedPackageIndex];

  const getMatchBadgeType = (status: string) => {
    switch (status) {
      case 'Exact Part Match': return 'green';
      case 'Family Match': return 'blue';
      case 'Approximate Match': return 'yellow';
      case 'No Reliable Match': return 'red';
      default: return 'blue';
    }
  };

  const getTrustBadgeType = (level: string) => {
    switch (level) {
      case 'Official Manufacturer Source': return 'green';
      case 'Authorized Distributor Source': return 'blue';
      case 'External Reference': return 'yellow';
      case 'Unverified': return 'red';
      default: return 'blue';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-blue-500/30 pb-20">
      {/* Top Warning Label */}
      <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-500 text-center py-2 text-sm font-medium">
        Student prototype - verify with official datasheet before final design.
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 relative">
        {/* Hamburger Menu */}
        <div className="absolute top-8 right-6 z-40">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all shadow-lg"
            aria-label="Menu"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {isMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-2 flex flex-col gap-1">
                <a
                  href="https://github.com/thehakank"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors group"
                >
                  <Github className="w-4 h-4 text-zinc-500 group-hover:text-zinc-100" />
                  <span>GitHub</span>
                  <ExternalLink className="w-3 h-3 ml-auto text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
                <a
                  href="https://www.linkedin.com/in/hakan-kuran-b1ba14284/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors group"
                >
                  <Linkedin className="w-4 h-4 text-zinc-500 group-hover:text-blue-400" />
                  <span>LinkedIn</span>
                  <ExternalLink className="w-3 h-3 ml-auto text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Header */}
        <header className="mb-12 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-2xl mb-4 border border-blue-500/20">
            <Cpu className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-4xl font-bold text-zinc-100 tracking-tight mb-3">
            Datasheet Pilot
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            High-trust engineering summaries for semiconductor components.
          </p>
        </header>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-12">
          <div className="relative flex items-center">
            <div className="absolute left-4 text-zinc-500">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter component (e.g., NE555, STM32F103)..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-12 pr-32 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-lg"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg px-6 py-2.5 font-medium transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Searching</span>
                </>
              ) : (
                <span>Lookup</span>
              )}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="max-w-2xl mx-auto mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out space-y-8">
            
            {data.isGenericQuery ? (
              <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-8 text-center max-w-2xl mx-auto">
                <div className="inline-flex items-center justify-center p-4 bg-zinc-800/50 rounded-full mb-4">
                  <HelpCircle className="w-8 h-8 text-zinc-400" />
                </div>
                <h3 className="text-xl font-semibold text-zinc-200 mb-2">Generic Query Detected</h3>
                <p className="text-zinc-400 leading-relaxed">
                  This query does not match a clearly verified manufacturer part number. Try entering a specific manufacturer part number (e.g., "NE555", "STM32F103C8T6") or continue with a lower-confidence search.
                </p>
              </div>
            ) : (
              <>
                {/* Results Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
                  <div className="flex items-center gap-4">
                    <h2 className="text-4xl font-bold text-zinc-100">{data.partNumber}</h2>
                  </div>
                </div>

                {/* Quick Facts Header */}
                <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-6">
                    <FactItem label="Manufacturer" value={data.manufacturer} />
                    <FactItem label="Part Type" value={data.partType} />
                    <FactItem label="Selected Package" value={selectedPackage?.name || 'N/A'} />
                    <FactItem label="Supply Range" value={data.supplyRange} />
                    <FactItem label="Match Status" value={data.matchStatus} isBadge badgeType={getMatchBadgeType(data.matchStatus)} />
                    <FactItem label="Source Trust" value={data.sourceTrustLevel} isBadge badgeType={getTrustBadgeType(data.sourceTrustLevel)} />
                  </div>
                </div>

                {/* 1. Package & Pinout Section (Prioritized) */}
                <section className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800/50">
                        <Cpu className="w-5 h-5 text-indigo-400" />
                      </div>
                      <h3 className="text-xl font-semibold text-zinc-100">Pin Configuration</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      {/* Package Selector */}
                      {data.packages && data.packages.length > 1 && (
                        <div className="flex items-center gap-3">
                          <label className="text-zinc-400 text-sm font-medium">Package:</label>
                          <div className="relative">
                            <select
                              className="appearance-none bg-zinc-950 border border-zinc-700 text-zinc-100 py-2 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                              value={selectedPackageIndex}
                              onChange={(e) => setSelectedPackageIndex(Number(e.target.value))}
                            >
                              {data.packages.map((pkg, idx) => (
                                <option key={idx} value={idx}>{pkg.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedPackage ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                      {/* Visual IC Diagram */}
                      <div className="flex justify-center bg-zinc-950/50 rounded-xl border border-zinc-800/50 p-8 overflow-x-auto min-h-[320px]">
                        <ICDiagram 
                          pins={selectedPackage.pins} 
                          packageName={selectedPackage.name} 
                          isDiscrete={data.isDiscrete}
                        />
                      </div>

                      {/* Pin Table */}
                      <div className="bg-zinc-950/50 rounded-xl border border-zinc-800/50 overflow-hidden flex flex-col">
                        <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                          <table className="w-full text-sm text-left">
                            <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/80 border-b border-zinc-800/50 sticky top-0 z-10">
                              <tr>
                                <th className="px-4 py-3 font-medium">Pin</th>
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="px-4 py-3 font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                              {selectedPackage.pins.map((pin, idx) => (
                                <tr key={idx} className="hover:bg-zinc-900/30 transition-colors">
                                  <td className="px-4 py-3 font-mono text-zinc-300">{pin.number}</td>
                                  <td className="px-4 py-3 font-semibold text-indigo-400">{pin.name}</td>
                                  <td className="px-4 py-3 text-zinc-400">{pin.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {selectedPackage.pins.length > 10 && (
                          <div className="px-4 py-2 bg-zinc-900/50 border-t border-zinc-800/50 text-[10px] text-zinc-500 text-center italic">
                            Showing all {selectedPackage.pins.length} pins. Scroll to view more.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-500 italic">No pinout data available.</p>
                  )}
                </section>

                {/* 2. Limits & Operating Conditions */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Absolute Maximum Ratings */}
                  <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800/50">
                        <Zap className="w-5 h-5 text-red-400" />
                      </div>
                      <h3 className="text-xl font-semibold text-zinc-100">Absolute Maximum Ratings</h3>
                    </div>
                    
                    <div className="flex-1 bg-zinc-950/50 rounded-xl border border-zinc-800/50 overflow-hidden mb-4">
                      <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-zinc-800/50">
                          {data.absoluteMaximumRatings?.map((rating, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-3 text-zinc-300">{rating.parameter}</td>
                              <td className="px-4 py-3 font-mono text-red-400 text-right">{rating.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-auto bg-red-500/5 border border-red-500/10 rounded-lg p-3 text-xs text-red-400/90 leading-relaxed">
                      <strong>⚠️ Engineering Note:</strong> Stresses beyond those listed under Absolute Maximum Ratings may cause permanent damage to the device. These are stress ratings only, and functional operation of the device at these or any other conditions beyond those indicated under Recommended Operating Conditions is not implied.
                    </div>
                  </div>

                  {/* Recommended Operating Conditions */}
                  <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800/50">
                        <Activity className="w-5 h-5 text-emerald-400" />
                      </div>
                      <h3 className="text-xl font-semibold text-zinc-100">Recommended Operating Conditions</h3>
                    </div>
                    
                    <div className="flex-1 bg-zinc-950/50 rounded-xl border border-zinc-800/50 overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-zinc-800/50">
                          {data.recommendedOperatingConditions?.map((rating, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-3 text-zinc-300">{rating.parameter}</td>
                              <td className="px-4 py-3 font-mono text-emerald-400 text-right">{rating.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                {/* 3. Description & Notes */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800/50">
                        <BookOpen className="w-5 h-5 text-blue-400" />
                      </div>
                      <h3 className="text-lg font-medium text-zinc-200">Description</h3>
                    </div>
                    <p className="text-zinc-400 leading-relaxed whitespace-pre-wrap">
                      {data.description}
                    </p>
                  </div>

                  <div className="bg-orange-500/5 border border-orange-500/10 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800/50">
                        <AlertCircle className="w-5 h-5 text-orange-400" />
                      </div>
                      <h3 className="text-lg font-medium text-orange-400">Student Usage Notes</h3>
                    </div>
                    <p className="text-orange-200/70 leading-relaxed whitespace-pre-wrap">
                      {data.studentUsageNotes}
                    </p>
                  </div>
                </section>

                {/* 4. Source Section */}
                <section className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-4 flex-1">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800/50">
                          <FileText className="w-5 h-5 text-zinc-400" />
                        </div>
                        <h3 className="text-lg font-medium text-zinc-200">Datasheet Reference</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="block text-zinc-500 mb-1 flex items-center gap-1.5"><Factory className="w-3.5 h-3.5" /> Manufacturer</span>
                          <span className="text-zinc-200 font-medium">{data.manufacturer}</span>
                        </div>
                        <div>
                          <span className="block text-zinc-500 mb-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Title</span>
                          <span className="text-zinc-200 font-medium">{data.datasheetTitle}</span>
                        </div>
                        <div>
                          <span className="block text-zinc-500 mb-1 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Revision</span>
                          <span className="text-zinc-200 font-medium">{data.revision}</span>
                        </div>
                        <div>
                          <span className="block text-zinc-500 mb-1 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Reason Selected</span>
                          <span className="text-zinc-200 font-medium">{data.sourceReasoning}</span>
                        </div>
                      </div>
                    </div>

                    <a 
                      href={data.sourceLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-zinc-900 bg-zinc-100 hover:bg-white transition-colors font-semibold px-6 py-3 rounded-xl w-full md:w-auto justify-center shrink-0"
                    >
                      <span>Open Datasheet</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </div>

      {/* Floating Chat Bubble & Panel */}
      {data && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
          {isChatOpen && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-[380px] max-w-[calc(100vw-3rem)] mb-4 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
              {/* Header */}
              <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500/20 rounded-md">
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-zinc-100 text-sm">Ask about {data.partNumber}</h3>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-zinc-400 hover:text-zinc-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Messages */}
              <div className="p-4 h-[350px] overflow-y-auto flex flex-col gap-4 bg-zinc-950/50">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col gap-3 h-full justify-center">
                    <p className="text-zinc-400 text-sm text-center mb-2">How can I help with this component?</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {suggestedQuestions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleChatSubmit(undefined, q)}
                          className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs px-3 py-1.5 rounded-full transition-colors text-left"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                            <Bot className="w-3.5 h-3.5 text-indigo-400" />
                          </div>
                        )}
                        <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-zinc-800 text-zinc-200 rounded-tl-sm'}`}>
                          {msg.role === 'assistant' ? (
                            <div className="markdown-body prose prose-invert prose-sm max-w-none">
                              <Markdown>{msg.content}</Markdown>
                            </div>
                          ) : (
                            msg.content
                          )}
                        </div>
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                          <Bot className="w-3.5 h-3.5 text-indigo-400" />
                        </div>
                        <div className="px-4 py-2 rounded-2xl bg-zinc-800 text-zinc-400 text-sm rounded-tl-sm flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> {chatLoadingState}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Input Area */}
              <div className="bg-zinc-900 border-t border-zinc-800 p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Answer Length</span>
                  <div className="flex bg-zinc-950 rounded-md p-0.5 border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setAnswerLength('quick')}
                      className={`px-2 py-1 text-[10px] font-medium rounded-sm transition-colors ${answerLength === 'quick' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      Quick
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswerLength('detailed')}
                      className={`px-2 py-1 text-[10px] font-medium rounded-sm transition-colors ${answerLength === 'detailed' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      Detailed
                    </button>
                  </div>
                </div>
                <form onSubmit={(e) => handleChatSubmit(e)} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Ask about ${data.partNumber}...`}
                    className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-100 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                    disabled={isChatLoading}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
                <p className="text-[10px] text-zinc-500 text-center">
                  * Answers are based on the selected datasheet context.
                </p>
              </div>
            </div>
          )}

          {!isChatOpen && (
            <button
              onClick={() => setIsChatOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-full shadow-lg shadow-indigo-900/20 transition-transform hover:scale-105 flex items-center gap-2"
            >
              <MessageSquare className="w-6 h-6" />
              <span className="font-medium pr-1">Ask about {data.partNumber}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Helper for Quick Facts
function FactItem({ label, value, isBadge, badgeType }: { label: string, value: string, isBadge?: boolean, badgeType?: 'green' | 'blue' | 'yellow' | 'red' }) {
  const badgeColors = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{label}</span>
      {isBadge ? (
        <div className="flex items-start">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${badgeColors[badgeType || 'blue']}`}>
            {value}
          </span>
        </div>
      ) : (
        <span className="text-sm text-zinc-200 font-medium">{value}</span>
      )}
    </div>
  );
}

// Visual IC Diagram Component
function ICDiagram({ pins, packageName, isDiscrete }: { pins: Pin[], packageName: string, isDiscrete: boolean }) {
  if (!pins || pins.length === 0) return null;
  
  if (isDiscrete) {
    return (
      <div className="flex flex-col items-center justify-center py-8 w-full h-full min-h-[240px]">
        <div className="text-zinc-400 text-xs font-sans font-medium tracking-wider uppercase bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800/50 mb-8">
          {packageName} • Pin Layout
        </div>
        <div className="flex flex-wrap justify-center gap-6">
          {pins.map(pin => (
            <div key={pin.number} className="flex flex-col items-center gap-2 group">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border-2 border-zinc-700 flex items-center justify-center text-zinc-100 font-bold group-hover:border-indigo-500 transition-colors">
                {pin.number}
              </div>
              <span className="text-zinc-400 text-xs font-medium group-hover:text-indigo-400 transition-colors">{pin.name}</span>
            </div>
          ))}
        </div>
        <p className="text-zinc-500 text-[10px] mt-8 italic">
          * Visual package preview not available for this component type.
        </p>
      </div>
    );
  }

  const isStandardIC = pins.length <= 64;
  
  if (!isStandardIC) {
    return (
      <div className="text-zinc-500 text-sm flex items-center justify-center h-full">
        Visual diagram not available for this package type. See table.
      </div>
    );
  }

  const half = Math.ceil(pins.length / 2);
  const leftPins = pins.slice(0, half);
  const rightPins = [...pins.slice(half)].reverse();

  return (
    <div className="flex justify-center items-stretch gap-1 font-mono text-sm py-8 relative mt-4">
      {/* Top View Label */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 text-zinc-400 text-xs font-sans font-medium tracking-wider uppercase bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800/50">
        {packageName} • Top View
      </div>

      {/* Left Pins (Names & Legs) */}
      <div className="flex flex-col justify-around items-end gap-3 py-4">
        {leftPins.map(pin => (
          <div key={pin.number} className="flex items-center gap-2 h-6 group">
            <span className="text-zinc-400 text-xs text-right w-28 truncate group-hover:text-indigo-400 transition-colors" title={pin.name}>
              {pin.name}
            </span>
            <div className="w-5 h-1.5 bg-zinc-500 rounded-sm group-hover:bg-indigo-400 transition-colors"></div>
          </div>
        ))}
      </div>

      {/* IC Body */}
      <div className="w-24 bg-zinc-900 border-2 border-zinc-700 rounded-lg relative flex flex-col justify-around py-4 shadow-xl">
        {/* Top Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-2.5 bg-zinc-950 border-b-2 border-x-2 border-t-0 border-zinc-700 rounded-b-full"></div>
        
        {/* Pin 1 Marker */}
        <div className="absolute top-3 left-2 w-2 h-2 bg-zinc-600 rounded-full"></div>
        
        <div className="flex justify-between h-full px-2">
          {/* Left Pin Numbers */}
          <div className="flex flex-col justify-around h-full">
            {leftPins.map(pin => (
              <span key={pin.number} className="text-zinc-300 text-xs h-6 flex items-center justify-center w-4">
                {pin.number}
              </span>
            ))}
          </div>
          {/* Right Pin Numbers */}
          <div className="flex flex-col justify-around h-full">
            {rightPins.map(pin => (
              <span key={pin.number} className="text-zinc-300 text-xs h-6 flex items-center justify-center w-4">
                {pin.number}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Pins (Legs & Names) */}
      <div className="flex flex-col justify-around items-start gap-3 py-4">
        {rightPins.map(pin => (
          <div key={pin.number} className="flex items-center gap-2 h-6 group">
            <div className="w-5 h-1.5 bg-zinc-500 rounded-sm group-hover:bg-indigo-400 transition-colors"></div>
            <span className="text-zinc-400 text-xs text-left w-28 truncate group-hover:text-indigo-400 transition-colors" title={pin.name}>
              {pin.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Visual IC Diagram Component (3D View)
// REMOVED: 3D Preview feature removed as per user request to prioritize accuracy for non-IC components.

