from __future__ import annotations

from django.urls import path

from .views import DatasetCollectionView, DatasetDetailView, DatasetExportView


urlpatterns = [
    path("", DatasetCollectionView.as_view(), name="dataset-collection"),
    path("<str:dataset_id>/", DatasetDetailView.as_view(), name="dataset-detail"),
    path("<str:dataset_id>/export/", DatasetExportView.as_view(), name="dataset-export"),
]

