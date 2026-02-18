import { config } from 'dotenv';
config({ path: '.env.local' });

import { textToSpeech } from './packages/shared/src/sarvam/tts';
import { speechToText } from './packages/shared/src/sarvam/asr';
import { hydrateEHRContext } from './packages/shared/src/ehr/hydration';
import { ConversationEngine } from './packages/shared/src/claude/conversation-engine';

const PATIENT_ID = 'd67070eb-67ac-4317-9c29-d9fb828b4243';

async function main() {
  console.log('\n=== VOICE PIPELINE TEST ===\n');

  // Step 1: Test Sarvam TTS
  console.log('1. Sarvam TTS — generating audio from text...');
  const testText = "I have been having headaches for the past few days.";
  try {
    const audioBuffer = await textToSpeech(testText, 'en-IN');
    console.log(`   ✓ Generated ${audioBuffer.length} bytes of audio`);

    // Step 2: Test Sarvam ASR — feed the TTS audio back
    console.log('\n2. Sarvam ASR — transcribing the generated audio...');
    const asrResult = await speechToText(audioBuffer);
    console.log(`   ✓ Transcript: "${asrResult.transcript}"`);
    console.log(`   ✓ Language: ${asrResult.language_code}`);

    // Step 3: Test greeting generation
    console.log('\n3. Greeting generation...');
    const ehrContext = await hydrateEHRContext(PATIENT_ID);
    const engine = new ConversationEngine(ehrContext);
    const greeting = await engine.getGreeting();
    console.log(`   ✓ Greeting: "${greeting.content.substring(0, 80)}..."`);

    // Step 4: Test greeting TTS
    console.log('\n4. Greeting TTS...');
    const greetingAudio = await textToSpeech(greeting.content, 'en-IN');
    console.log(`   ✓ Greeting audio: ${greetingAudio.length} bytes`);

    // Step 5: Full pipeline: ASR → Claude → TTS
    console.log('\n5. Full pipeline (ASR → Claude → TTS)...');
    const response = await engine.sendMessage(asrResult.transcript);
    console.log(`   ✓ Doctor response: "${response.content.substring(0, 100)}..."`);
    const responseAudio = await textToSpeech(response.content, 'en-IN');
    console.log(`   ✓ Response audio: ${responseAudio.length} bytes`);
    console.log(`   ✓ Emergency: ${response.isEmergency}`);

    // Step 6: Test Hindi TTS
    console.log('\n6. Hindi TTS...');
    const hindiText = "मुझे सिरदर्द हो रहा है";
    const hindiAudio = await textToSpeech(hindiText, 'hi-IN');
    console.log(`   ✓ Hindi audio: ${hindiAudio.length} bytes`);

    // ASR on Hindi
    console.log('\n7. Hindi ASR...');
    const hindiAsr = await speechToText(hindiAudio);
    console.log(`   ✓ Hindi transcript: "${hindiAsr.transcript}"`);
    console.log(`   ✓ Detected language: ${hindiAsr.language_code}`);

    console.log('\n=== ALL VOICE TESTS PASSED ===\n');
  } catch (err) {
    console.error('\n!!! VOICE TEST FAILED !!!\n');
    console.error(err);
    process.exit(1);
  }
}

main();
