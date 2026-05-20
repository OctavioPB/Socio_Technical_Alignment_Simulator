"""Test configuration for Airflow DAG/operator tests.

Adds the operators directory to sys.path so operator modules can be
imported by their filename (matching how Airflow loads them from the
plugins directory at runtime).
"""

import pathlib
import sys

_OPERATORS_DIR = str(
    pathlib.Path(__file__).parent.parent.parent
    / "pipelines"
    / "airflow"
    / "operators"
)
if _OPERATORS_DIR not in sys.path:
    sys.path.insert(0, _OPERATORS_DIR)
