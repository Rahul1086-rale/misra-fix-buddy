# misra_chat_client.py
import vertexai
from vertexai.generative_models import GenerativeModel, ChatSession, GenerationConfig, SafetySetting, HarmCategory, HarmBlockThreshold

# === Step 0: Init Vertex AI ===
def init_vertex_ai():
    vertexai.init(
        project="rock-range-464908-g5",
        location="global"
    )

# === Step 1: Load Numbered C++ File ===
def load_cpp_file(file_path: str) -> str:
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

# === Step 2: Start Gemini Chat ===
def start_chat(
    model_name="gemini-2.5-pro",
    temperature=0.5,
    top_p=0.95,
    max_tokens=65535,
    safety_settings=False
) -> ChatSession:
    # Setup generation config with provided settings
    generation_config = GenerationConfig(
        temperature=temperature,
        top_p=top_p,
        max_output_tokens=max_tokens,
        seed=15,
    )

    # Setup safety settings based on user preference
    if safety_settings:
        # Enable default safety filtering
        safety_config = [
            SafetySetting(category=HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold=HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE),
            SafetySetting(category=HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold=HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE),
            SafetySetting(category=HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold=HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE),
            SafetySetting(category=HarmCategory.HARM_CATEGORY_HARASSMENT, threshold=HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE),
        ]
    else:
        # Disable safety filtering (original behavior)
        safety_config = [
            SafetySetting(category=HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold=HarmBlockThreshold.BLOCK_NONE),
            SafetySetting(category=HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold=HarmBlockThreshold.BLOCK_NONE),
            SafetySetting(category=HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold=HarmBlockThreshold.BLOCK_NONE),
            SafetySetting(category=HarmCategory.HARM_CATEGORY_HARASSMENT, threshold=HarmBlockThreshold.BLOCK_NONE),
        ]

    # Initialize model with configs
    model = GenerativeModel(
        model_name=model_name,
        generation_config=generation_config,
        safety_settings=safety_config,
    )
    print("************************")
    print(model_name)

    return model.start_chat()

# === Step 3: Send first prompt with file ===
def send_file_intro(chat: ChatSession, numbered_cpp: str):
    intro_prompt = (
        "You are an expert C++ developer specializing in MISRA C++ compliance for AUTOSAR embedded systems. "
        "I am providing you with the complete content of a C++ source file. Each line of the file is prefixed with "
        "its original line number followed by a colon. Please acknowledge that you have received and processed this entire file. "
        "Do not start fixing anything yet. Just confirm its reception and readiness for the next input, by saying: "
        "'FILE RECEIVED. READY FOR VIOLATIONS.'"
    )

    try:
        # Send system + file content
        #chat.send_message(intro_prompt)
        combined_message = intro_prompt + "\n\n" + numbered_cpp
        resp = chat.send_message(combined_message)
        print("\n=== Gemini ===", flush=True)
        
        # Handle blocked responses
        if resp is None:
            print("Response was blocked by safety filters")
            return None
        
        # Check if response has text
        if hasattr(resp, 'text') and resp.text:
            print(resp.text)
            return resp.text
        else:
            print("Response was empty or blocked")
            return None
            
    except Exception as e:
        print(f"Error in send_file_intro: {str(e)}")
        return None

# === Step 4: Send list of violations to fix ===
def send_misra_violations(chat: ChatSession, violations_text: str) -> str:
    second_prompt = (
        """
            Thank you for confirming. The C++ file content you received previously is the current state of the file, which may have already undergone some fixes.

            Now, I am providing you with a list of **specific, currently unresolved MISRA C++ violations** that need to be addressed in the file. **For each violation in this list, I require a fixed code snippet.**

            Your task is to:
            1.  **Identify the specific code location** for each violation in the `CURRENT MISRA Violations to Fix` list within the C++ file you previously received.
            2.  **Apply the necessary MISRA C++ compliant fix** to that code.
            3.  **Provide ONLY the fixed C++ code snippet** for each violation. This snippet should be a small, relevant section of the code including the fix and enough surrounding context to clearly identify its position.
            4. After the snippet, provide a JSON mapping like: 
            Violation_Mapping_list =
            {
                "52": {
                    "rule": "Rule_10_1",
                    "changed_lines": ["52", "52a", "52b"]
                },
                "104": {
                    "rule": "Rule_8_4",
                    "changed_lines": ["104"]
                }
            }

            **Important Note on Previous Fixes:**
            If a violation listed below is related to an issue you have previously fixed (e.g., a change to a macro definition that impacts multiple usage sites), and your analysis indicates that the *same type of fix* is still applicable for this new reported instance, please **re-provide the appropriate fixed code snippet** for this specific line. Do not state that it is "already addressed"; instead, act as if it's a new instance requiring the same solution.

            Ensure all fixes:
            * Strictly adhere to MISRA C++ guidelines.
            * Preserve the original functionality.
            * Maintain the existing coding style and formatting (indentation, braces, comments, empty lines betweens functions etc.).
            * **Do NOT introduce any new MISRA violations.**
            * **Crucially, maintain the original line numbering prefix for each line in the fixed snippet.** Only modify the C++ code *after* the colon.
            * *** If you insert **any new lines**, you must assign them a **line number based on the preceding line**, followed by lowercase letters in alphabetical order.
            - Example: If a new line is to be inserted **after line 100**, label it as `100a:`. If more than one line is added after line 100, continue as `100b:`, `100c:`, and so on.**
            * **If a line's content should be removed or made empty as part of a fix, output only its line number followed by a colon (e.g., `123:`). Do NOT omit the line number itself.**

            ---

            **Output Instructions (Continuation):**
            Don't add `...` for non-fixed parts.
            Don't remove the lines between functions if any.
            Give all changed/fixed lines in a single snippet for all violations in cpp``` Snippet ``` format only.
            If there are too many fixed snippets to fit into a single response due to output token limits, provide a partial set. After each response, if more snippets are remaining, explicitly state: `--- CONTINUED ---` and wait for my 'next' command to provide the next batch. Do not provide any more output until I type 'next'.
            If you have provided all requested fixed snippets for this batch of violations, simply stop. Do NOT output `--- CONTINUED ---`.

            ---

            Here is the list of violations to fix:

            ---

            Please begin
        """
        + violations_text
    )

    resp = chat.send_message(second_prompt)
    print("\n=== Gemini Fixes ===")
    print(resp.text)
    return resp.text
