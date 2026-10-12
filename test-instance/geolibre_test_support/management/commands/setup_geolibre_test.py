from django.conf import settings
from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand, CommandError
from oauth2_provider.models import Application

from arches.app.models.graph import Graph
from arches.app.utils.betterJSONSerializer import JSONDeserializer
from arches.app.utils.data_management.resource_graphs.importer import import_graph

from geolibre_test_support.constants import (
    CONTRIBUTOR_USERNAME,
    EDITOR_USERNAME,
    GRAPH_FILE,
    GRAPH_ID,
    TEST_PASSWORD,
    VIEWER_USERNAME,
)

OAUTH_APPLICATION_NAME = "arches-geolibre"


class Command(BaseCommand):
    help = (
        "Imports the GeoLibre Test Asset model and creates the OAuth application "
        "and test users the arches-geolibre plugin signs in with."
    )

    def handle(self, *args, **options):
        if not settings.OAUTH_CLIENT_ID:
            raise CommandError("Set OAUTH_CLIENT_ID in settings_local.py first.")

        self.import_test_model()
        self.create_oauth_application()
        # Edits by anyone outside Resource Reviewer are saved as provisional.
        self.create_user(
            EDITOR_USERNAME, groups=["Resource Editor", "Resource Reviewer"]
        )
        self.create_user(CONTRIBUTOR_USERNAME, groups=["Resource Editor"])
        self.create_user(VIEWER_USERNAME, groups=["Guest"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Ready. Sign in as {EDITOR_USERNAME} (edits apply directly), "
                f"{CONTRIBUTOR_USERNAME} (edits are provisional) or "
                f"{VIEWER_USERNAME} (read only), password {TEST_PASSWORD!r}."
            )
        )

    def import_test_model(self):
        # Re-importing would replace the graph and cascade-delete its resources.
        if Graph.objects.filter(pk=GRAPH_ID).exists():
            self.stdout.write("The GeoLibre Test Asset model is already loaded.")
            return
        with open(GRAPH_FILE) as graph_file:
            graphs = JSONDeserializer().deserialize(graph_file)["graph"]
        import_graph(graphs, overwrite_graphs=True)
        Graph.objects.get(pk=GRAPH_ID).publish(notes="arches-geolibre test setup")
        self.stdout.write("Imported and published the GeoLibre Test Asset model.")

    def create_oauth_application(self):
        Application.objects.update_or_create(
            client_id=settings.OAUTH_CLIENT_ID,
            defaults={
                "name": OAUTH_APPLICATION_NAME,
                "client_type": Application.CLIENT_PUBLIC,
                "authorization_grant_type": Application.GRANT_PASSWORD,
                "redirect_uris": "",
                "user": User.objects.get(username="admin"),
            },
        )
        self.stdout.write(
            f"OAuth application {OAUTH_APPLICATION_NAME!r} uses client id "
            f"{settings.OAUTH_CLIENT_ID}."
        )

    def create_user(self, username, groups):
        user, _created = User.objects.get_or_create(username=username)
        user.set_password(TEST_PASSWORD)
        user.save()
        user.groups.set(Group.objects.filter(name__in=groups))
        self.stdout.write(f"User {username} is in groups: {groups or 'none'}.")
