import sys
import os
import json
import asyncio
from typing import List, Dict
import httpx

# Add the plugin's root directory to the Python path to allow for local imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from academic_platforms.arxiv import ArxivSearcher
from academic_platforms.pubmed import PubMedSearcher
from academic_platforms.biorxiv import BioRxivSearcher
from academic_platforms.medrxiv import MedRxivSearcher
from academic_platforms.google_scholar import GoogleScholarSearcher
from paper import Paper

# Instances of searchers
arxiv_searcher = ArxivSearcher()
pubmed_searcher = PubMedSearcher()
biorxiv_searcher = BioRxivSearcher()
medrxiv_searcher = MedRxivSearcher()
google_scholar_searcher = GoogleScholarSearcher()

# Asynchronous helper to adapt synchronous searchers
async def async_search(searcher, query: str, max_results: int) -> List[Dict]:
    async with httpx.AsyncClient() as client:
        papers = searcher.search(query, max_results)
        return [paper.to_dict() for paper in papers]

# Tool definitions
async def search_arxiv(query: str, max_results: int = 10) -> Dict:
    try:
        max_results = int(max_results)
    except (ValueError, TypeError):
        max_results = 10  # Fallback to default if conversion fails
    papers = await async_search(arxiv_searcher, query, max_results)
    return {"status": "success", "result": papers if papers else []}

async def search_pubmed(query: str, max_results: int = 10) -> Dict:
    try:
        max_results = int(max_results)
    except (ValueError, TypeError):
        max_results = 10  # Fallback to default if conversion fails
    papers = await async_search(pubmed_searcher, query, max_results)
    return {"status": "success", "result": papers if papers else []}

async def search_biorxiv(query: str, max_results: int = 10) -> Dict:
    try:
        max_results = int(max_results)
    except (ValueError, TypeError):
        max_results = 10  # Fallback to default if conversion fails
    papers = await async_search(biorxiv_searcher, query, max_results)
    return {"status": "success", "result": papers if papers else []}

async def search_medrxiv(query: str, max_results: int = 10) -> Dict:
    try:
        max_results = int(max_results)
    except (ValueError, TypeError):
        max_results = 10  # Fallback to default if conversion fails
    papers = await async_search(medrxiv_searcher, query, max_results)
    return {"status": "success", "result": papers if papers else []}

async def search_google_scholar(query: str, max_results: int = 10) -> Dict:
    try:
        max_results = int(max_results)
    except (ValueError, TypeError):
        max_results = 10  # Fallback to default if conversion fails
    papers = await async_search(google_scholar_searcher, query, max_results)
    return {"status": "success", "result": papers if papers else []}

async def download_arxiv(paper_id: str, save_path: str = "./downloads") -> Dict:
    try:
        result = arxiv_searcher.download_pdf(paper_id, save_path)
        return {"status": "success", "result": result}
    except Exception as e:
        return {"status": "error", "error": str(e)}

async def read_arxiv_paper(paper_id: str, save_path: str = "./downloads") -> Dict:
    try:
        result = arxiv_searcher.read_paper(paper_id, save_path)
        return {"status": "success", "result": result}
    except Exception as e:
        return {"status": "error", "error": f"Error reading paper {paper_id}: {e}"}

async def main():
    try:
        input_data = json.loads(sys.stdin.read())
        # The command to run is extracted, and the rest of the input is treated as arguments.
        command = input_data.pop("command", None)
        args = input_data
    except json.JSONDecodeError:
        print(json.dumps({"status": "error", "error": "Invalid JSON input."}), file=sys.stdout)
        return

    tool_functions = {
        "search_arxiv": search_arxiv,
        "search_pubmed": search_pubmed,
        "search_biorxiv": search_biorxiv,
        "search_medrxiv": search_medrxiv,
        "search_google_scholar": search_google_scholar,
        "download_arxiv": download_arxiv,
        "read_arxiv_paper": read_arxiv_paper,
    }

    if command in tool_functions:
        try:
            result = await tool_functions[command](**args)
            print(json.dumps(result), file=sys.stdout)
        except Exception as e:
            print(json.dumps({"status": "error", "error": str(e)}), file=sys.stdout)
    else:
        print(json.dumps({"status": "error", "error": f"Unknown command: {command}"}), file=sys.stdout)

if __name__ == "__main__":
    asyncio.run(main())