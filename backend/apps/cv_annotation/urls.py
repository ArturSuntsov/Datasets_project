from django.urls import path

from .views import (
    AnnotatorAssignmentDetailView,
    AnnotatorProjectDetailView,
    AnnotatorProjectNextAssignmentView,
    AnnotatorProjectsView,
    AnnotatorAssignmentSubmitView,
    AnnotatorQueueView,
    ProjectExportView,
    ProjectImportFinalizeView,
    ProjectImportView,
    ProjectOverviewView,
    ReviewDetailView,
    ReviewResolveView,
    ReviewerQueueView,
    SecurityEventsView,
)

urlpatterns = [
    path("projects/<str:project_id>/imports/", ProjectImportView.as_view(), name="project-imports"),
    path("projects/<str:project_id>/imports/<str:import_id>/finalize/", ProjectImportFinalizeView.as_view(), name="project-import-finalize"),
    path("projects/<str:project_id>/overview/", ProjectOverviewView.as_view(), name="project-overview"),
    path("projects/<str:project_id>/export/", ProjectExportView.as_view(), name="project-export"),
    path("annotator/queue/", AnnotatorQueueView.as_view(), name="annotator-queue"),
    path("annotator/projects/", AnnotatorProjectsView.as_view(), name="annotator-projects"),
    path("annotator/projects/<str:project_id>/", AnnotatorProjectDetailView.as_view(), name="annotator-project-detail"),
    path("annotator/projects/<str:project_id>/next-assignment/", AnnotatorProjectNextAssignmentView.as_view(), name="annotator-project-next-assignment"),
    path("annotator/assignments/<str:assignment_id>/", AnnotatorAssignmentDetailView.as_view(), name="annotator-assignment-detail"),
    path("annotator/assignments/<str:assignment_id>/submit/", AnnotatorAssignmentSubmitView.as_view(), name="annotator-assignment-submit"),
    path("reviewer/queue/", ReviewerQueueView.as_view(), name="reviewer-queue"),
    path("reviews/<str:review_id>/", ReviewDetailView.as_view(), name="review-detail"),
    path("reviews/<str:review_id>/resolve/", ReviewResolveView.as_view(), name="review-resolve"),
    path("projects/<str:project_id>/security-events/", SecurityEventsView.as_view(), name="project-security-events"),
]
