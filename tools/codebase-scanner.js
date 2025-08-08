#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

/**
 * AI Agent Code Scanner
 * Automatically discovers AI API calls in codebases and suggests instrumentation
 */

// Patterns to detect AI service calls
const AI_PATTERNS = {
  openai: {
    imports: [
      /from ['"]openai['"]/, 
      /require\(['"]openai['"]\)/,
      /import.*openai/i
    ],
    calls: [
      /openai\.chat\.completions\.create/,
      /openai\.completions\.create/,
      /openai\.embeddings\.create/,
      /openai\.images\.generate/,
      /\.chat\.completions\.create/,
      /\.completions\.create/,
      /\.embeddings\.create/
    ]
  },
  anthropic: {
    imports: [
      /from ['"]@anthropic-ai\/sdk['"]/, 
      /require\(['"]@anthropic-ai\/sdk['"]\)/,
      /import.*anthropic/i
    ],
    calls: [
      /anthropic\.messages\.create/,
      /\.messages\.create/,
      /claude.*create/i
    ]
  },
  mistral: {
    imports: [
      /from ['"]@mistralai\/mistralai['"]/, 
      /require\(['"]@mistralai\/mistralai['"]\)/
    ],
    calls: [
      /mistral\.chat\.complete/,
      /\.chat\.complete/
    ]
  },
  // Generic patterns for custom APIs
  generic: {
    calls: [
      /fetch\(['"](.*api.*ai.*)['"]\)/,
      /axios\.(get|post)\(['"](.*api.*ai.*)['"]\)/,
      /\.post\(['"](.*\/chat\/.*)['"]\)/,
      /\.post\(['"](.*\/completions.*)['"]\)/
    ]
  }
};

class CodebaseScanner {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.findings = [];
  }

  async scan() {
    console.log(`🔍 Scanning ${this.rootDir} for AI agent patterns...`);
    
    // Find all relevant files
    const files = await glob('**/*.{js,ts,jsx,tsx,py}', {
      cwd: this.rootDir,
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
    });

    for (const file of files) {
      await this.scanFile(file);
    }

    return this.generateReport();
  }

  async scanFile(relativePath) {
    const fullPath = path.join(this.rootDir, relativePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    let hasAIImports = false;
    const aiCalls = [];

    // Check for AI imports
    for (const [vendor, patterns] of Object.entries(AI_PATTERNS)) {
      if (vendor === 'generic') continue;
      
      for (const importPattern of patterns.imports) {
        if (importPattern.test(content)) {
          hasAIImports = true;
          break;
        }
      }
    }

    // Check for AI API calls
    lines.forEach((line, index) => {
      for (const [vendor, patterns] of Object.entries(AI_PATTERNS)) {
        for (const callPattern of patterns.calls) {
          if (callPattern.test(line)) {
            aiCalls.push({
              vendor,
              line: index + 1,
              code: line.trim(),
              pattern: callPattern.source
            });
          }
        }
      }
    });

    if (hasAIImports || aiCalls.length > 0) {
      this.findings.push({
        file: relativePath,
        hasImports: hasAIImports,
        calls: aiCalls,
        language: this.detectLanguage(relativePath)
      });
    }
  }

  detectLanguage(filePath) {
    const ext = path.extname(filePath);
    const langMap = {
      '.js': 'javascript',
      '.ts': 'typescript', 
      '.jsx': 'react',
      '.tsx': 'react-ts',
      '.py': 'python'
    };
    return langMap[ext] || 'unknown';
  }

  generateReport() {
    const totalFiles = this.findings.length;
    const totalCalls = this.findings.reduce((sum, f) => sum + f.calls.length, 0);

    console.log('\n📊 SCAN RESULTS');
    console.log('================');
    console.log(`Files with AI calls: ${totalFiles}`);
    console.log(`Total AI API calls found: ${totalCalls}`);

    if (totalFiles === 0) {
      console.log('❌ No AI agent patterns detected in this codebase');
      return { findings: [], instrumentation: null };
    }

    console.log('\n📁 FILES DETECTED:');
    this.findings.forEach(finding => {
      console.log(`\n  ${finding.file} (${finding.language})`);
      console.log(`    Imports: ${finding.hasImports ? '✅' : '❌'}`);
      console.log(`    API calls: ${finding.calls.length}`);
      
      finding.calls.forEach(call => {
        console.log(`      Line ${call.line}: ${call.code}`);
      });
    });

    return {
      findings: this.findings,
      instrumentation: this.generateInstrumentation()
    };
  }

  generateInstrumentation() {
    const instructions = [];

    // JavaScript/TypeScript instrumentation
    const jsFiles = this.findings.filter(f => ['javascript', 'typescript', 'react', 'react-ts'].includes(f.language));
    if (jsFiles.length > 0) {
      instructions.push({
        language: 'javascript',
        steps: [
          '1. Install AgentOS SDK: npm install @agentos/cost-tracker',
          '2. Import: import { CostTracker, TrackedOpenAI } from "@agentos/cost-tracker"',
          '3. Initialize tracker with your API key and agent ID',
          '4. Wrap your AI clients with our tracked versions',
          '5. Costs automatically reported to your dashboard'
        ],
        example: `
// Before
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// After  
import { CostTracker, TrackedOpenAI } from '@agentos/cost-tracker';
const tracker = new CostTracker({
  apiKey: process.env.AGENTOS_KEY,
  agentId: 'my-chatbot',
  customerId: 'customer-123'
});
const openai = new TrackedOpenAI(new OpenAI({ apiKey: process.env.OPENAI_KEY }), tracker);
        `
      });
    }

    // Python instrumentation  
    const pyFiles = this.findings.filter(f => f.language === 'python');
    if (pyFiles.length > 0) {
      instructions.push({
        language: 'python',
        steps: [
          '1. Install: pip install agentos-cost-tracker',
          '2. Import the tracker and wrapper',
          '3. Wrap your OpenAI client',
          '4. All costs automatically tracked'
        ],
        example: `
# Before
import openai
client = openai.OpenAI(api_key="your-key")

# After
from agentos import CostTracker, TrackedOpenAI
tracker = CostTracker(api_key="your-agentos-key", agent_id="my-agent")
client = TrackedOpenAI(openai.OpenAI(api_key="your-key"), tracker)
        `
      });
    }

    return instructions;
  }
}

// CLI interface
if (require.main === module) {
  const targetDir = process.argv[2] || '.';
  
  if (!fs.existsSync(targetDir)) {
    console.error(`❌ Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const scanner = new CodebaseScanner(targetDir);
  scanner.scan().then(result => {
    if (result.instrumentation) {
      console.log('\n🛠️  INSTRUMENTATION GUIDE:');
      result.instrumentation.forEach(guide => {
        console.log(`\n${guide.language.toUpperCase()}:`);
        guide.steps.forEach(step => console.log(`  ${step}`));
        console.log(`\nExample:${guide.example}`);
      });
    }
    
    console.log('\n✅ Scan complete! Ready to add cost tracking to your agents.');
  });
}

module.exports = { CodebaseScanner };
