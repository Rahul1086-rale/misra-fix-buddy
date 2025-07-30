from misra_chat_client import init_vertex_ai, load_cpp_file, start_chat, send_file_intro, send_misra_violations
from excel_utils import extract_violations_for_file


# Get the violations for target file from excel report
excel_path = rf"C:\WorkSpace\RealThingks\AI\MISRA-fix\GeminIntegration_Scripts\Misra_12_2_Updated.xlsx"
target_file = "safemondoor.cpp"

if __name__ == "__main__":
    # Step 0: Setup
    init_vertex_ai()

    # Step 1: Load numbered file
    cpp_file = "numbered_safemondoor.cpp"
    numbered_content = load_cpp_file(cpp_file)
    print("*********numbered_content*********\n", numbered_content)

    # Step 2: Start session
    chat = start_chat(model_name="gemini-2.5-flash")

    # Step 3: Send file
    response_1 = send_file_intro(chat, numbered_content)

    # Step 4: Send violations
    violation_block = extract_violations_for_file(excel_path, target_file)
    print("*********List of violations*********\n", violation_block)


    if violation_block:
        send_misra_violations(chat, violation_block)
    else:
        print(f"No violations found for {target_file}.")

    # You can now parse response_2 and apply fixes
