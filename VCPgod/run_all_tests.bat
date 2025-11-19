@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul
set PYTHONIOENCODING=utf-8

echo === Running Unit Tests ===

if not exist "test_results" mkdir test_results
if not exist "Memory\TestData" mkdir "Memory\TestData"

echo Testing KnowledgeIndexer...
echo {} | python Plugin/KnowledgeIndexer/knowledge_indexer.py > test_results/ki_unit.json 2>&1
if %errorlevel% equ 0 (
    echo [PASS]
) else (
    echo [FAIL]
    type test_results\ki_unit.json
)

echo Testing OmniscientReasoner...
python -c "import json; print(json.dumps({'query': '如何提高记忆效率？', 'reasoning_depth': 5, 'reasoning_mode': 'all'}, ensure_ascii=False))" > test_results/temp_or_input.json
type test_results\temp_or_input.json | node Plugin/OmniscientReasoner/omniscient_reasoner.js > test_results/or_unit.json 2>&1
if %errorlevel% equ 0 (
    echo [PASS]
) else (
    echo [FAIL]
    type test_results\or_unit.json
)

echo Testing ReasoningTracer...
python -c "import json; print(json.dumps({'reasoning_id': 'R-TEST-001', 'query': '测试问题', 'reasoning_steps': [{'step': 1, 'type': 'deductive', 'description': '测试步骤'}], 'result': '测试结论', 'confidence': 0.85}, ensure_ascii=False))" > test_results/temp_rt_input.json
type test_results\temp_rt_input.json | python Plugin/ReasoningTracer/reasoning_tracer.py > test_results/rt_unit.json 2>&1
if %errorlevel% equ 0 (
    echo [PASS]
) else (
    echo [FAIL]
    type test_results\rt_unit.json
)

echo Testing ConfidenceEstimator...
python -c "import json; print(json.dumps({'reasoning_result': {'answer': '测试答案', 'query': '测试问题', 'reasoning_process': {}, 'confidence': 0.8}}, ensure_ascii=False))" > test_results/temp_ce_input.json
type test_results\temp_ce_input.json | node Plugin/ConfidenceEstimator/confidence_estimator.js > test_results/ce_unit.json 2>&1
if %errorlevel% equ 0 (
    echo [PASS]
) else (
    echo [FAIL]
    type test_results\ce_unit.json
)

echo.
echo === Running Integration Test Flow ===

echo Step 1: Knowledge Indexing...
set MEMORY_DATA_PATH=./Memory/TestData
echo {} | python Plugin/KnowledgeIndexer/knowledge_indexer.py > test_results/step1_kg.json 2>&1
if %errorlevel% equ 0 (
    echo [PASS]
) else (
    echo [FAIL]
    type test_results\step1_kg.json
)

echo Step 2: Reasoning...
python -c "import json; print(json.dumps({'query': '如何提高记忆效率？', 'reasoning_mode': 'all'}, ensure_ascii=False))" > test_results/temp_step2_input.json
type test_results\temp_step2_input.json | node Plugin/OmniscientReasoner/omniscient_reasoner.js > test_results/step2_reasoning.json 2>&1
if %errorlevel% equ 0 (
    echo [PASS]
) else (
    echo [FAIL]
    type test_results\step2_reasoning.json
)

echo Step 3: Confidence Assessment...
python -c "import json; f=open('test_results/step2_reasoning.json', encoding='utf-8'); data=json.load(f); print(json.dumps({'reasoning_result': data['result']}, ensure_ascii=False))" > test_results/temp_step3_input.json
type test_results\temp_step3_input.json | node Plugin/ConfidenceEstimator/confidence_estimator.js > test_results/step3_confidence.json 2>&1
if %errorlevel% equ 0 (
    echo [PASS]
) else (
    echo [FAIL]
    type test_results\step3_confidence.json
)

echo Step 4: Reasoning Trace...
python -c "import json; print(json.dumps({'reasoning_id': 'R-INTEGRATION-001', 'query': '如何提高记忆效率？', 'reasoning_steps': [{'step': 1, 'type': 'deductive', 'description': '基于记忆规律'}, {'step': 2, 'type': 'inductive', 'description': '总结成功案例'}], 'result': '使用间隔重复法', 'confidence': 0.85}, ensure_ascii=False))" > test_results/temp_step4_input.json
type test_results\temp_step4_input.json | python Plugin/ReasoningTracer/reasoning_tracer.py > test_results/step4_trace.json 2>&1
if %errorlevel% equ 0 (
    echo [PASS]
) else (
    echo [FAIL]
    type test_results\step4_trace.json
)

echo.
echo === Test Complete ===
