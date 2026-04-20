from django.urls import path

from .views import (
    AnnotatorAssignmentDetailView,
    AnnotatorAssignmentSubmitView,
    AnnotatorQueueView,
    ProjectExportView,
    ProjectImportFinalizeView,
    ProjectImportView,
    ProjectOverviewView,
    ReviewDetailView,
    ReviewResolveView,
    ReviewerQueueView,
)

urlpatterns = [
    path("projects/<str:project_id>/imports/", ProjectImportView.as_view(), name="project-imports"),
    path("projects/<str:project_id>/imports/<str:import_id>/finalize/", ProjectImportFinalizeView.as_view(), name="project-import-finalize"),
    path("projects/<str:project_id>/overview/", ProjectOverviewView.as_view(), name="project-overview"),
    path("projects/<str:project_id>/export/", ProjectExportView.as_view(), name="project-export"),
    path("annotator/queue/", AnnotatorQueueView.as_view(), name="annotator-queue"),
    path("annotator/assignments/<str:assignment_id>/", AnnotatorAssignmentDetailView.as_view(), name="annotator-assignment-detail"),
    path("annotator/assignments/<str:assignment_id>/submit/", AnnotatorAssignmentSubmitView.as_view(), name="annotator-assignment-submit"),
    path("reviewer/queue/", ReviewerQueueView.as_view(), name="reviewer-queue"),
    path("reviews/<str:review_id>/", ReviewDetailView.as_view(), name="review-detail"),
    path("reviews/<str:review_id>/resolve/", ReviewResolveView.as_view(), name="review-resolve"),
]
