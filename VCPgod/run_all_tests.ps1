# VCPgod Automated Testing Script

$ErrorActionPreference = "Stop"

Write-Host "=== Running Unit Tests ===" -ForegroundColor Cyan

# Create directories
New-Item -ItemType Directory -Force -Path "test_results" | Out-Null
New-Item -ItemType Directory -Force -Path "Memory/TestData" | Out-Null

# KnowledgeIndexer
Write-Host "Testing KnowledgeIndexer..." -NoNewline
try {
    echo "{}" | python Plugin/KnowledgeIndexer/knowledge_indexer.py > test_results/ki_unit.json
    if ($LASTEXITCODE -eq 0) { 
        Write-Host " [PASS]" -ForegroundColor Green 
    } else { 
        Write-Host " [FAIL]" -ForegroundColor Red 
    }
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host $_
}

# OmniscientReasoner
Write-Host "Testing OmniscientReasoner..." -NoNewline
try {
    $or_input = @{
        query = "如何提高记忆效率？"
        reasoning_depth = 5
        reasoning_mode = "all"
    }
    $or_input | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 "test_results/temp_or_unit_input.json"
    Get-Content "test_results/temp_or_unit_input.json" | node Plugin/OmniscientReasoner/omniscient_reasoner.js > test_results/or_unit.json
    if ($LASTEXITCODE -eq 0) { 
        Write-Host " [PASS]" -ForegroundColor Green 
    } else { 
        Write-Host " [FAIL]" -ForegroundColor Red 
    }
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host $_
}

# ReasoningTracer
Write-Host "Testing ReasoningTracer..." -NoNewline
try {
    $rt_input = @{
        reasoning_id = "R-TEST-001"
        query = "测试问题"
        reasoning_steps = @(
            @{step=1; type="deductive"; description="测试步骤"}
        )
        result = "测试结论"
        confidence = 0.85
    }
    $rt_input | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 "test_results/temp_rt_unit_input.json"
    Get-Content "test_results/temp_rt_unit_input.json" | python Plugin/ReasoningTracer/reasoning_tracer.py > test_results/rt_unit.json
    if ($LASTEXITCODE -eq 0) { 
        Write-Host " [PASS]" -ForegroundColor Green 
    } else { 
        Write-Host " [FAIL]" -ForegroundColor Red 
    }
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host $_
}

# ConfidenceEstimator
Write-Host "Testing ConfidenceEstimator..." -NoNewline
try {
    $ce_input = @{
        reasoning_result = @{
            answer = "测试答案"
            query = "测试问题"
            reasoning_process = @{}
            confidence = 0.8
        }
    }
    $ce_input | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 "test_results/temp_ce_unit_input.json"
    Get-Content "test_results/temp_ce_unit_input.json" | node Plugin/ConfidenceEstimator/confidence_estimator.js > test_results/ce_unit.json
    if ($LASTEXITCODE -eq 0) { 
        Write-Host " [PASS]" -ForegroundColor Green 
    } else { 
        Write-Host " [FAIL]" -ForegroundColor Red 
    }
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host $_
}

# 2. Integration Test Flow
Write-Host "`n=== Running Integration Test Flow ===" -ForegroundColor Cyan

# Step 1: Knowledge Indexing
Write-Host "Step 1: Knowledge Indexing..."
$env:MEMORY_DATA_PATH = "./Memory/TestData"
try {
    echo "{}" | python Plugin/KnowledgeIndexer/knowledge_indexer.py > test_results/step1_kg.json
    if ($LASTEXITCODE -eq 0) { 
        Write-Host " [PASS]" -ForegroundColor Green 
    } else { 
        Write-Host " [FAIL]" -ForegroundColor Red 
    }
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host $_
}

# Step 2: Reasoning
Write-Host "Step 2: Reasoning..."
try {
    $reasoning_input = @{
        query = "如何提高记忆效率？"
        reasoning_mode = "all"
    }
    $reasoning_input | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 "test_results/temp_step2_input.json"
    Get-Content "test_results/temp_step2_input.json" | node Plugin/OmniscientReasoner/omniscient_reasoner.js > test_results/step2_reasoning.json
    if ($LASTEXITCODE -eq 0) { 
        Write-Host " [PASS]" -ForegroundColor Green 
    } else { 
        Write-Host " [FAIL]" -ForegroundColor Red 
    }
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host $_
}

# Step 3: Confidence Assessment
Write-Host "Step 3: Confidence Assessment..."
try {
    # Read the reasoning result
    $reasoning_json = Get-Content "test_results/step2_reasoning.json" -Raw | ConvertFrom-Json
    
    # Prepare input for confidence estimator
    $ce_input_obj = @{ reasoning_result = $reasoning_json.result }
    $ce_input_obj | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 "test_results/temp_step3_input.json"
    
    Get-Content "test_results/temp_step3_input.json" | node Plugin/ConfidenceEstimator/confidence_estimator.js > test_results/step3_confidence.json
    if ($LASTEXITCODE -eq 0) { 
        Write-Host " [PASS]" -ForegroundColor Green 
    } else { 
        Write-Host " [FAIL]" -ForegroundColor Red 
    }
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host $_
}

# Step 4: Reasoning Trace
Write-Host "Step 4: Reasoning Trace..."
try {
    $trace_input = @{
        reasoning_id = "R-INTEGRATION-001"
        query = "如何提高记忆效率？"
        reasoning_steps = @(
            @{step=1; type="deductive"; description="基于记忆规律"},
            @{step=2; type="inductive"; description="总结成功案例"}
        )
        result = "使用间隔重复法"
        confidence = 0.85
    }
    $trace_input | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 "test_results/temp_step4_input.json"
    
    Get-Content "test_results/temp_step4_input.json" | python Plugin/ReasoningTracer/reasoning_tracer.py > test_results/step4_trace.json
    if ($LASTEXITCODE -eq 0) { 
        Write-Host " [PASS]" -ForegroundColor Green 
    } else { 
        Write-Host " [FAIL]" -ForegroundColor Red 
    }
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host $_
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
